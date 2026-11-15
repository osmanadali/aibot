# Masaustu kisayolunun calistirdigi dosya: robotu gorunur bir komut penceresi
# olmadan baslatir. Bir sorun olursa ekrana kisa bir uyari cikarir.
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Force -Path 'veri' | Out-Null

function Uyar($mesaj) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($mesaj, 'Robot') | Out-Null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Uyar 'Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kur, sonra tekrar dene.'
  exit 1
}
if (-not (Test-Path -LiteralPath 'node_modules')) {
  cmd /c 'npm install --no-audit --no-fund > veri\kurulum.log 2>&1'
}

cmd /c 'node robot.js uygulama > veri\uygulama.log 2>&1'
if ($LASTEXITCODE -ne 0) {
  Uyar "Robot baslatilamadi. Ayrinti icin su dosyaya bak:`n$PSScriptRoot\veri\uygulama.log"
}
