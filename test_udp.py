import cv2
import time

def test_rtp(url):
    print(f"[*] Testing cv2.VideoCapture({url!r})...")
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        print("[-] Failed to open stream.")
        return
    
    print("[+] Stream opened! Reading frames...")
    start = time.time()
    frames = 0
    while time.time() - start < 10.0:
        ret, frame = cap.read()
        if ret:
            frames += 1
            if frames == 1:
                h, w = frame.shape[:2]
                print(f"[+] Successfully read first frame: {w}x{h}")
                break
        else:
            time.sleep(0.01)
            
    cap.release()
    print(f"[+] Finished. Frames read: {frames}")

if __name__ == '__main__':
    # Kill any lingering Python processes first
    import os
    print("[*] Running RTP test...")
    test_rtp("rtp://@192.168.31.171:5005")
