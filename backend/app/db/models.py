import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, Float, LargeBinary, Text, BigInteger
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(String(50), nullable=False, default="viewer")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class Person(Base):
    __tablename__ = "persons"

    person_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_code = Column(String(100), unique=True, nullable=True)
    full_name = Column(String(255), nullable=False)
    status = Column(String(30), nullable=False, default="active")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    embeddings = relationship("FaceEmbedding", back_populates="person", cascade="all, delete-orphan")
    events = relationship("RecognitionEvent", back_populates="person")
    thresholds = relationship("IdentityThreshold", back_populates="person")

class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    embedding_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id = Column(UUID(as_uuid=True), ForeignKey("persons.person_id", ondelete="CASCADE"), nullable=False)
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(100), nullable=False)
    embedding_dimension = Column(Integer, nullable=False)
    embedding = Column(LargeBinary, nullable=False)
    quality_score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    person = relationship("Person", back_populates="embeddings")

class Camera(Base):
    __tablename__ = "cameras"

    camera_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    camera_code = Column(String(100), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    source_type = Column(String(30), nullable=False)
    source_config = Column(JSONB, nullable=False, default={})
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    events = relationship("RecognitionEvent", back_populates="camera")

class RecognitionEvent(Base):
    __tablename__ = "recognition_events"

    event_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    camera_id = Column(UUID(as_uuid=True), ForeignKey("cameras.camera_id", ondelete="SET NULL"), nullable=True)
    track_id = Column(BigInteger, nullable=False)
    person_id = Column(UUID(as_uuid=True), ForeignKey("persons.person_id", ondelete="SET NULL"), nullable=True)
    status = Column(String(30), nullable=False)           # known / unknown / abstain / error
    similarity = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    threshold_type = Column(String(30), nullable=False)   # fixed / global_evt / identity_gpd
    fallback_used = Column(Boolean, nullable=False, default=False)
    quality_score = Column(Float, nullable=True)
    model_version = Column(String(100), nullable=True)
    threshold_table_version = Column(String(100), nullable=True)
    error_code = Column(String(60), nullable=True)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    snapshot_path = Column(Text, nullable=True)
    metadata_json = Column("metadata", JSONB, nullable=True, default={})

    camera = relationship("Camera", back_populates="events")
    person = relationship("Person", back_populates="events")

class IdentityThreshold(Base):
    __tablename__ = "identity_thresholds"

    threshold_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    threshold_table_version = Column(String(100), nullable=False)
    identity_id = Column(UUID(as_uuid=True), ForeignKey("persons.person_id", ondelete="SET NULL"), nullable=True)
    threshold_type = Column(String(30), nullable=False)   # identity_gpd / global_evt / fixed
    threshold_value = Column(Float, nullable=False)
    fallback_used = Column(Boolean, nullable=False, default=False)
    n_impostor_scores = Column(Integer, nullable=True)
    n_exceedances = Column(Integer, nullable=True)
    u_quantile = Column(Float, nullable=True)
    u_value = Column(Float, nullable=True)
    alpha = Column(Float, nullable=True)
    gpd_shape = Column(Float, nullable=True)
    gpd_scale = Column(Float, nullable=True)
    fit_status = Column(String(20), nullable=False)       # valid / warning / failed / fallback
    model_version = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    person = relationship("Person", back_populates="thresholds")
