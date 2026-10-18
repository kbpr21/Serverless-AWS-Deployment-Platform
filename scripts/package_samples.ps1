# Package sample projects into clean, cross-platform ZIP files
$ErrorActionPreference = "Stop"

Write-Host "=== Packaging Sample Projects with Cross-Platform Forward Slashes ===" -ForegroundColor Cyan

python -c @"
import os, zipfile

samples_dir = os.path.abspath('samples')

def zip_folder(folder_name, zip_name):
    folder_path = os.path.join(samples_dir, folder_name)
    zip_path = os.path.join(samples_dir, zip_name)
    if os.path.exists(zip_path):
        os.remove(zip_path)
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(folder_path):
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist']]
            for file in files:
                if file.endswith('.zip'): continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, folder_path).replace('\\', '/')
                z.write(full_path, rel_path)
    print(f'[+] Created: {zip_path}')

zip_folder('static-html', 'static-html.zip')
zip_folder('vite-react-spa', 'vite-react-spa.zip')
"@

Write-Host "Both sample ZIP archives are ready for deployment!" -ForegroundColor Green
