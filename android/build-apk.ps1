$ErrorActionPreference = 'Stop'
$toolRoot = Join-Path $PSScriptRoot '.local-build'
$javaHome = Join-Path $toolRoot 'jdk-17'
$sdkRoot = Join-Path $toolRoot 'android-sdk'
$gradle = Join-Path $toolRoot 'gradle-8.9\bin\gradle.bat'
if (-not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) { throw 'JDK 17 não encontrado em android/.local-build/jdk-17' }
if (-not (Test-Path (Join-Path $sdkRoot 'platforms\android-35\android.jar'))) { throw 'Android SDK 35 não encontrado em android/.local-build/android-sdk' }
if (-not (Test-Path $gradle)) { throw 'Gradle 8.9 não encontrado em android/.local-build/gradle-8.9' }
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-user-home'
$env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT'
$env:Path = "$(Join-Path $javaHome 'bin');$(Join-Path $sdkRoot 'platform-tools');$env:Path"
$sdkPropertiesPath = Join-Path $PSScriptRoot 'local.properties'
$sdkPathForProperties = $sdkRoot.Replace('\','/')
[IO.File]::WriteAllText($sdkPropertiesPath, "sdk.dir=$sdkPathForProperties`n", [Text.UTF8Encoding]::new($false))
& $gradle --no-daemon -p $PSScriptRoot :app:assembleDebug
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$dist=Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$apkPath=Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk'
$releaseApk=Join-Path $dist 'BlobTrack-Celular-00-debug.apk'
Copy-Item -LiteralPath $apkPath -Destination $releaseApk -Force
Write-Host "APK: $releaseApk"
