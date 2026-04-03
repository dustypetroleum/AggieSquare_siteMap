import os
from PIL import Image
from pillow_heif import register_heif_opener

# Register HEIF opener with Pillow
register_heif_opener()

def batch_convert_heic_to_jpg(directory):
    # Walk through the directory
    for filename in os.listdir(directory):
        if filename.lower().endswith(".heic"):
            heic_path = os.path.join(directory, filename)
            # Create new filename by swapping extension
            jpg_path = os.path.join(directory, os.path.splitext(filename)[0] + ".jpg")
            
            try:
                with Image.open(heic_path) as img:
                    # Convert to RGB (HEIC is often RGBA or high-depth)
                    img = img.convert("RGB")
                    img.save(jpg_path, "JPEG", quality=90)
                print(f"Converted: {filename} -> {os.path.basename(jpg_path)}")
                
                # Optional: Uncomment the line below to delete the original HEIC after successful conversion
                # os.remove(heic_path)
                
            except Exception as e:
                print(f"Failed to convert {filename}: {e}")

# Run the function on your photos folder
batch_convert_heic_to_jpg("assets/photostoconvert")