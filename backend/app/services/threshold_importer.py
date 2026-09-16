import os
import json
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.models import IdentityThreshold, Person

logger = logging.getLogger("threshold_importer")

CANDIDATE_PATHS = [
    os.path.expanduser("~/open-set-face-recognition/thresholds/threshold_table.json"),
    "/home/jetson/open-set-face-recognition/thresholds/threshold_table.json",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../thresholds/threshold_table.json")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../thresholds/threshold_table.json")),
    "/data/thresholds/threshold_table.json",
    "threshold_table.json",
]


def find_threshold_file(custom_path: str = None) -> str | None:
    """Finds threshold_table.json in candidate system paths."""
    if custom_path:
        expanded = os.path.expanduser(custom_path)
        if os.path.isfile(expanded):
            return expanded
        return None

    env_path = os.getenv("THRESHOLD_TABLE_PATH")
    if env_path and os.path.isfile(os.path.expanduser(env_path)):
        return os.path.expanduser(env_path)

    for path in CANDIDATE_PATHS:
        expanded = os.path.expanduser(path)
        if os.path.isfile(expanded):
            return expanded

    return None


def extract_raw_records(raw_data: dict | list):
    """
    Extracts standardized raw entries from various possible JSON representations:
    Returns a list of tuples: (identifier_str_or_none, item_dict, table_version, model_version)
    """
    records = []
    top_version = "evt_pot_v1"
    top_model = "insightface_r100_fp16"

    if isinstance(raw_data, dict):
        top_version = raw_data.get("threshold_table_version") or raw_data.get("version") or top_version
        top_model = raw_data.get("model_version") or raw_data.get("model") or top_model

        # 1. Check for global_evt section
        if "global_evt" in raw_data and isinstance(raw_data["global_evt"], dict):
            records.append(("global_evt", raw_data["global_evt"], top_version, top_model))

        # 2. Check for fixed section
        if "fixed" in raw_data and isinstance(raw_data["fixed"], dict):
            records.append(("fixed", raw_data["fixed"], top_version, top_model))

        # 3. Check for identities / thresholds dictionary
        if "identities" in raw_data and isinstance(raw_data["identities"], dict):
            for id_key, id_val in raw_data["identities"].items():
                if isinstance(id_val, dict):
                    records.append((id_key, id_val, top_version, top_model))
        elif "thresholds" in raw_data and isinstance(raw_data["thresholds"], dict):
            for id_key, id_val in raw_data["thresholds"].items():
                if isinstance(id_val, dict):
                    records.append((id_key, id_val, top_version, top_model))
        elif "records" in raw_data and isinstance(raw_data["records"], list):
            for item in raw_data["records"]:
                if isinstance(item, dict):
                    records.append((None, item, top_version, top_model))
        else:
            # Dict mapping directly from identity name/key to config dict
            for id_key, id_val in raw_data.items():
                if id_key in ["threshold_table_version", "model_version", "created_at", "metadata", "timestamp", "version", "model"]:
                    continue
                if isinstance(id_val, dict):
                    records.append((id_key, id_val, top_version, top_model))

    elif isinstance(raw_data, list):
        for item in raw_data:
            if isinstance(item, dict):
                records.append((None, item, top_version, top_model))

    return records, top_version, top_model


def import_thresholds_from_data(raw_data: dict | list, db: Session, clear_existing: bool = True):
    """
    Parses threshold data and inserts into identity_thresholds table per Spec Section 13.6.
    """
    records, top_version, top_model = extract_raw_records(raw_data)
    if not records:
        raise ValueError("No valid threshold entries found in provided data.")

    # Map enrolled persons in database for resolution
    enrolled_persons = db.query(Person).all()
    persons_by_id = {str(p.person_id): p for p in enrolled_persons}
    persons_by_name = {p.full_name.strip().lower(): p for p in enrolled_persons if p.full_name}
    persons_by_code = {p.student_code.strip().lower(): p for p in enrolled_persons if p.student_code}

    if clear_existing:
        logger.info(f"Removing existing thresholds for version {top_version} or all outdated records...")
        db.query(IdentityThreshold).delete()
        db.commit()

    created_instances = []
    matched_count = 0

    for id_key, item, default_version, default_model in records:
        # Determine threshold type
        raw_type = item.get("threshold_type")
        if not raw_type:
            if id_key in ["global_evt", "global"]:
                raw_type = "global_evt"
            elif id_key in ["fixed", "fixed_baseline"]:
                raw_type = "fixed"
            else:
                raw_type = "identity_gpd"

        # Resolve identity_id (null for global_evt / fixed)
        identity_id = None
        if raw_type not in ["global_evt", "fixed"]:
            cand = item.get("identity_id") or id_key or item.get("identity_name") or item.get("name")
            if cand:
                cand_str = str(cand).strip()
                if cand_str in persons_by_id:
                    identity_id = persons_by_id[cand_str].person_id
                    matched_count += 1
                else:
                    norm = cand_str.lower()
                    if norm in persons_by_name:
                        identity_id = persons_by_name[norm].person_id
                        matched_count += 1
                    elif norm in persons_by_code:
                        identity_id = persons_by_code[norm].person_id
                        matched_count += 1
                    else:
                        # Attempt UUID parsing
                        try:
                            cand_uuid = uuid.UUID(cand_str)
                            identity_id = cand_uuid
                        except Exception:
                            pass

        # Extract values
        threshold_val = float(item.get("threshold_value", item.get("threshold", item.get("value", 0.72))))
        fallback_used = bool(item.get("fallback_used", False))
        n_impostors = item.get("n_impostor_scores") or item.get("n_impostors") or item.get("n_scores")
        n_exceed = item.get("n_exceedances") or item.get("n_exceed")
        u_quant = item.get("u_quantile") or item.get("quantile") or 0.95
        u_val = item.get("u_value") or item.get("u")
        alpha_val = item.get("alpha") or 0.99
        shape_val = item.get("gpd_shape") or item.get("shape") or item.get("xi")
        scale_val = item.get("gpd_scale") or item.get("scale") or item.get("sigma")
        status_val = str(item.get("fit_status") or item.get("status") or ("fallback" if fallback_used else "valid"))
        version_val = str(item.get("threshold_table_version") or default_version)
        model_val = str(item.get("model_version") or default_model)

        threshold_obj = IdentityThreshold(
            threshold_id=uuid.uuid4(),
            threshold_table_version=version_val,
            identity_id=identity_id,
            threshold_type=raw_type,
            threshold_value=threshold_val,
            fallback_used=fallback_used,
            n_impostor_scores=int(n_impostors) if n_impostors is not None else None,
            n_exceedances=int(n_exceed) if n_exceed is not None else None,
            u_quantile=float(u_quant) if u_quant is not None else None,
            u_value=float(u_val) if u_val is not None else None,
            alpha=float(alpha_val) if alpha_val is not None else None,
            gpd_shape=float(shape_val) if shape_val is not None else None,
            gpd_scale=float(scale_val) if scale_val is not None else None,
            fit_status=status_val,
            model_version=model_val,
            created_at=datetime.now(timezone.utc)
        )
        db.add(threshold_obj)
        created_instances.append(threshold_obj)

    db.commit()
    logger.info(f"Successfully imported {len(created_instances)} threshold rows (Matched {matched_count} identities).")
    return {
        "status": "success",
        "imported_count": len(created_instances),
        "identities_matched": matched_count,
        "table_version": top_version,
        "model_version": top_model
    }


def import_thresholds_from_file(file_path: str = None, db: Session = None, clear_existing: bool = True):
    """Finds and loads threshold_table.json into identity_thresholds."""
    target_path = find_threshold_file(file_path)
    if not target_path:
        searched = [file_path] if file_path else CANDIDATE_PATHS
        raise FileNotFoundError(f"threshold_table.json not found. Searched locations: {searched}")

    logger.info(f"Loading threshold table from: {target_path}")
    with open(target_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    result = import_thresholds_from_data(raw_data, db, clear_existing=clear_existing)
    result["source_file"] = target_path
    return result
