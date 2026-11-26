<#
.SYNOPSIS
Inicia o emulador Android do BlobTrack, instala o APK, libera o CDP e abre o app no Chrome.

.DESCRIPTION
Pensado para manutenção: um único comando deixa o AVD pronto para testar o site publicado.
Não altera arquivos do app e não mexe no cache do service worker. As mensagens de console
são sem acentos de propósito: o cmd.exe do Windows não mostra UTF-8 sem ajustar a página.

.EXAMPLE
.\start-emulador.ps1
.EXAMPLE
.\start-emulador.ps1 -Url 'https://blobtrak.vercel.app/'
.EXAMPLE
.\start-emulador.ps1 -Parar
#>
param(
  [string] $Avd = 'BlobTrackEmulator',
  [string] $Url = 'https://blobtrak.vercel.app/',
  [switch] $SemApk,
  [switch] $SemChrome,
  [switch] $Parar
)

$ErrorActionPreference = 'Stop'
$toolRoot = Join-Path $PSScriptRoot '.local-build'
$sdkRoot = Join-Path $toolRoot 'android-sdk'
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
$apk = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist\BlobTrack-Celular-00-debug.apk'
$chromePackage = 'com.android.chrome'

if (-not (Test-Path -LiteralPath $adb)) { throw "adb nao encontrado: $adb. Rode .\build-apk.ps1 uma vez para preparar o SDK." }
if (-not (Test-Path -LiteralPath $emulator)) { throw "emulator.exe nao encontrado: $emulator" }

function Get-Emulador {
  $linhas = & $adb devices | Where-Object { $_ -match '^emulator-\d+\s+device$' }
  if (-not $linhas) { return $null }
  return (($linhas | Select-Object -First 1) -split '\s+')[0]
}

function Get-BootCompleto {
  param([string] $Serial)
  if (-not $Serial) { return $false }
  $valor = (& $adb -s $Serial shell getprop sys.boot_completed 2>$null | Out-String).Trim()
  return $valor -eq '1'
}

if ($Parar) {
  $serial = Get-Emulador
  if ($serial) {
    Write-Host "Encerrando emulador $serial..." -ForegroundColor Yellow
    & $adb -s $serial emu kill | Out-Null
    Write-Host 'Emulador encerrado.' -ForegroundColor Green
  } else {
    Write-Host 'Nenhum emulador conectado; nada a encerrar.' -ForegroundColor Yellow
  }
  return
}

Write-Host '==========================================' -ForegroundColor Cyan
Write-Host '  BlobTrack - Emulador Android' -ForegroundColor Cyan
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host ''

$avds = & $emulator -list-avds 2>$null | Where-Object { $_.Trim() }
if ($avds -and $Avd -notin $avds) {
  throw "AVD '$Avd' nao existe. Disponiveis: $($avds -join ', '). Passe outro com -Avd."
}

$serial = Get-Emulador
if (-not $serial) {
  Write-Host "Nenhum emulador conectado. Iniciando AVD '$Avd'..." -ForegroundColor Yellow
  Start-Process -FilePath $emulator -ArgumentList @('-avd', $Avd, '-no-boot-anim', '-no-snapshot-load')
  for ($i = 0; $i -lt 120; $i++) {
    $serial = Get-Emulador
    if (Get-BootCompleto -Serial $serial) { break }
    Start-Sleep -Seconds 2
  }
  if (-not (Get-BootCompleto -Serial $serial)) {
    throw 'O AVD nao concluiu o boot em 4 minutos. Abra o Android Studio > Device Manager e veja se a imagem iniciou.'
  }
}
Write-Host "Emulador pronto: $serial" -ForegroundColor Green

if (-not $SemApk -and (Test-Path -LiteralPath $apk)) {
  Write-Host 'Instalando APK debug...' -ForegroundColor Yellow
  & $adb -s $serial install -r $apk | Where-Object { $_ -match 'Success|Failure|Error' }
} elseif (-not $SemApk) {
  Write-Host "APK nao encontrado em $apk; rode .\build-apk.ps1 se quiser o app WebView." -ForegroundColor Yellow
}

Write-Host 'Liberando CDP na porta 9222...' -ForegroundColor Yellow
& $adb -s $serial forward tcp:9222 localabstract:chrome_devtools_remote | Out-Null

& $adb -s $serial shell pm grant $chromePackage android.permission.CAMERA 2>$null
& $adb -s $serial shell pm grant $chromePackage android.permission.RECORD_AUDIO 2>$null

if (-not $SemChrome) {
  $abaAberta = $false
  try {
    $alvos = Invoke-RestMethod -Uri 'http://127.0.0.1:9222/json' -TimeoutSec 3
    $abaAberta = [bool]($alvos | Where-Object { $_.url -eq $Url -or $_.url.StartsWith($Url) })
  } catch { }
  if ($abaAberta) {
    Write-Host "Chrome ja tem aba em $Url; nao abriu outra (evita o aviso de aba duplicada)." -ForegroundColor Yellow
  } else {
    Write-Host "Abrindo $Url no Chrome..." -ForegroundColor Yellow
    & $adb -s $serial shell am start -a android.intent.action.VIEW -d $Url -p $chromePackage 2>$null | Out-Null
  }
}

Write-Host ''
Write-Host 'Pronto. Proximos passos:' -ForegroundColor Green
Write-Host '  1. No Chrome do emulador, toque em Iniciar sessao e aceite a camera (aparece como "Traseira principal").'
Write-Host '  2. Para inspecionar via DevTools: http://127.0.0.1:9222/json'
Write-Host '  3. Para rodar o QA automatico: node scripts/qa-emulador.mjs'
Write-Host '  4. Para encerrar: .\start-emulador.ps1 -Parar'
Write-Host ''
Write-Host 'Lembrete: emulador e pre-checagem. Bateria, camera real, calor/GPU e iPhone/Safari continuam nao medidos.' -ForegroundColor Yellow
