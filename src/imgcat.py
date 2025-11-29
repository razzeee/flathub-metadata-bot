#!/usr/bin/env python3
import sys
from PIL import Image

def hex_to_rgb(hex_color):
    """Convert hex color (e.g., '#FF5500') to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def blend_with_background(pixel, bg_rgb):
    """Alpha blend a pixel with a background color."""
    r, g, b, a = pixel
    alpha = a / 255.0
    bg_r, bg_g, bg_b = bg_rgb
    return (
        int(r * alpha + bg_r * (1 - alpha)),
        int(g * alpha + bg_g * (1 - alpha)),
        int(b * alpha + bg_b * (1 - alpha))
    )

def render_image_lines(image_path, width=32, bg_color=None):
    """Render image to a list of ANSI-colored lines."""
    try:
        img = Image.open(image_path)
    except Exception as e:
        return [f"Error opening image: {e}"]

    # Logos are always 128x128, so we resize to a fixed square size
    # Using half blocks (▀), each character represents 2 vertical pixels
    img = img.resize((width, width), Image.Resampling.LANCZOS)
    img = img.convert('RGBA')

    pixels = img.load()
    w, h = img.size

    # Default background if none specified
    if bg_color is None:
        bg_rgb = (0, 0, 0)  # Black
    else:
        bg_rgb = hex_to_rgb(bg_color)

    lines = []
    # Print using half blocks
    for y in range(0, h - 1, 2):
        line = ""
        for x in range(w):
            p1 = pixels[x, y]
            p2 = pixels[x, y+1]

            # Blend with background color
            r1, g1, b1 = blend_with_background(p1, bg_rgb)
            r2, g2, b2 = blend_with_background(p2, bg_rgb)

            # Reset and set colors
            line += "\033[0m"
            line += f"\033[38;2;{r1};{g1};{b1}m"
            line += f"\033[48;2;{r2};{g2};{b2}m"
            line += "▀"

        lines.append(line + "\033[0m")

    return lines

def print_images_side_by_side(image_path, light_bg, dark_bg, width=32, gap=4):
    """Print two versions of the image side by side."""
    light_lines = render_image_lines(image_path, width, light_bg)
    dark_lines = render_image_lines(image_path, width, dark_bg)

    # Print headers
    light_header = f"Light ({light_bg})"
    dark_header = f"Dark ({dark_bg})"
    # Account for ANSI codes taking no visual space - each char in image is ~20 chars of ANSI
    gap_str = " " * gap
    print(f"   {light_header:<{width}}{gap_str}{dark_header}")

    # Print images side by side
    max_lines = max(len(light_lines), len(dark_lines))
    for i in range(max_lines):
        left = light_lines[i] if i < len(light_lines) else " " * width
        right = dark_lines[i] if i < len(dark_lines) else ""
        print(f"   {left}{gap_str}{right}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: imgcat.py <image_path> [light_bg_color] [dark_bg_color]")
        sys.exit(1)

    image_path = sys.argv[1]
    light_bg = sys.argv[2] if len(sys.argv) > 2 else "#FAFAFA"
    dark_bg = sys.argv[3] if len(sys.argv) > 3 else "#251F32"

    # Show both previews side by side
    print_images_side_by_side(image_path, light_bg, dark_bg)
