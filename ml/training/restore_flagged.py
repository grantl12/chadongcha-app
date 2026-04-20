import os
import shutil
from pathlib import Path

def restore_flagged():
    _HERE = Path(__file__).parent.parent
    base = _HERE / 'data'
    flag_dir = base / 'images_flagged'
    data_dir = base / 'images'
    
    if not flag_dir.exists():
        print("Flagged directory does not exist.")
        return

    # List and sort directories to handle alphabetically
    dirs = sorted([d for d in flag_dir.iterdir() if d.is_dir()], key=lambda x: x.name.lower())
    
    restored_classes = 0
    restored_files = 0
    
    target_limit = "chrysler_300"
    
    print(f"Restoring images up to '{target_limit}'...")
    
    for d in dirs:
        if d.name.lower() > target_limit:
            continue
            
        dst_class_dir = data_dir / d.name
        dst_class_dir.mkdir(parents=True, exist_ok=True)
        
        files = list(d.glob('*'))
        if not files:
            continue
            
        print(f"  Restoring {len(files)} files from {d.name}...")
        for f in files:
            shutil.move(str(f), str(dst_class_dir / f.name))
            restored_files += 1
        
        restored_classes += 1
        
    print(f"\nRestore complete.")
    print(f"  Classes processed: {restored_classes}")
    print(f"  Files moved back:  {restored_files}")

if __name__ == "__main__":
    restore_flagged()
