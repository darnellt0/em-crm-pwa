#!/usr/bin/env python3
"""
Generate PWA icons for Elevated Movements CRM
Creates 192x192 and 512x512 PNG icons with EM branding
"""

from PIL import Image, ImageDraw, ImageFont
import os
import sys

# Brand colors
BG_COLOR = "#36013f"  # Deep purple
TEXT_COLOR = "#ffffff"  # White

def create_icon(size, output_path):
    """Create a single icon with EM text centered"""
    # Create image with brand background
    img = Image.new('RGB', (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Try to use a bold system font, fall back to default if not available
    font_size = int(size * 0.45)  # Scale font to icon size

    try:
        # Try common bold fonts
        for font_name in ['Arial-Bold', 'Arial Bold', 'DejaVuSans-Bold', 'FreeSansBold']:
            try:
                font = ImageFont.truetype(font_name, font_size)
                break
            except:
                continue
        else:
            # If no TrueType fonts work, use default
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    # Draw "EM" text centered
    text = "EM"

    # Get text bounding box to center it properly
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    # Calculate position to center text
    x = (size - text_width) // 2 - bbox[0]
    y = (size - text_height) // 2 - bbox[1]

    # Draw the text
    draw.text((x, y), text, fill=TEXT_COLOR, font=font)

    # Save the image
    img.save(output_path, 'PNG', optimize=True)
    print(f"[OK] Created {output_path} ({size}x{size})")

def main():
    """Generate both icon sizes"""
    # Get script directory and project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    # Icon specifications
    icons = [
        (192, os.path.join(project_root, 'icon-192.png')),
        (512, os.path.join(project_root, 'icon-512.png'))
    ]

    print("Generating PWA icons for Elevated Movements CRM...")

    try:
        for size, path in icons:
            create_icon(size, path)

        print("\n[OK] All icons generated successfully!")
        return 0

    except Exception as e:
        print(f"\n[ERROR] Error generating icons: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
