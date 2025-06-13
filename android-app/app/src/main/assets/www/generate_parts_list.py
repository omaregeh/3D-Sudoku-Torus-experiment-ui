import os
import json

# Function to scan a folder and get a list of .gltf files relative to the directory
def scan_folder(directory):
    parts = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.gltf'):
                # Get the relative path of the file and remove the .gltf extension
                relative_path = os.path.relpath(os.path.join(root, file), directory)
                parts.append(relative_path.replace('\\', '/').replace('.gltf', ''))
    return parts

# Main function
def main():
    assets_path = 'assets'  # Assuming assets folder is in the same directory as the script

    # Ensure paths are correct based on the structure you provided
    cells_path = os.path.join(assets_path, 'Cells')
    numbers_path = os.path.join(assets_path, 'Numbers')
    borders_path = os.path.join(assets_path, 'Borders')
    additional_numbers_path = os.path.join(assets_path, 'AdditionalNumbers')

    # Scan each folder for parts
    parts_list = {
        "cells": scan_folder(cells_path),
        "numbers": scan_folder(numbers_path),
        "borders": scan_folder(borders_path),
        "additionalNumbers": scan_folder(additional_numbers_path)
    }

    # Save the parts list to a JSON file
    with open('partsList.json', 'w') as json_file:
        json.dump(parts_list, json_file, indent=4)

if __name__ == '__main__':
    main()
