# Masaustune "Robot" kisayolunu ekler (ya da var olani yeniler).
$kok = $PSScriptRoot
$kabuk = New-Object -ComObject WScript.Shell
$masaustu = [Environment]::GetFolderPath('Desktop')
$kisayol = $kabuk.CreateShortcut((Join-Path $masaustu 'Robot.lnk'))
$kisayol.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$kisayol.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $kok 'uygulama.ps1') + '"'
$kisayol.WorkingDirectory = $kok
$kisayol.IconLocation = Join-Path $kok 'arayuz\simge.ico'
$kisayol.WindowStyle = 7
$kisayol.Description = 'Robot'
$kisayol.Save()
Write-Host 'Masaustune "Robot" kisayolu eklendi.'
