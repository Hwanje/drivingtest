#!/usr/bin/env bash
# APK 빌드.
#
# 안드로이드 SDK 없이 만든다. aapt2 · d8 · Android Gradle Plugin 은 모두
# dl.google.com 에서만 배포되는데, 이 개발 환경에서는 그 호스트가 막혀 있다.
# 그래서 Maven Central 에서 받을 수 있는 것들로만 파이프라인을 짰다.
#
#   javac(JDK)          자바 컴파일 (android.jar 대신 robolectric android-all 사용)
#   dalvik-dx           .class → classes.dex
#   ARSCLib             평문 XML 대신 바이너리 AndroidManifest.xml 직접 생성
#   zip + jarsigner     APK 묶고 v1 서명
#
# targetSdk 를 28 로 둔 이유: 안드로이드 11 이상은 targetSdk 30 이상인 앱에
# v2 이상 서명을 요구한다. v1(jarsigner)만으로 서명하므로 28 로 맞췄다.
# 사이드로딩 설치에는 문제가 없다.
#
# 안드로이드 SDK 가 있는 컴퓨터라면 이 스크립트 대신 표준 Gradle 프로젝트로
# 빌드하는 편이 낫다. android/README.md 참고.
set -euo pipefail

PKG=kr.drivingtest
LABEL="기능시험 연습"
VCODE=1
VNAME=1.0
MINSDK=21
TARGETSDK=28

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="$HERE/build"
DEPS="${APK_DEPS_DIR:-$HERE/.deps}"
mkdir -p "$OUT" "$DEPS"

fetch() {   # fetch <파일명> <URL>
  [ -s "$DEPS/$1" ] && return 0
  echo "  받는 중: $1"
  curl -sSL --max-time 600 -o "$DEPS/$1" "$2"
}

echo "[1/6] 빌드 도구 준비"
fetch arsclib.jar   "https://repo1.maven.org/maven2/io/github/reandroid/ARSCLib/1.4.0/ARSCLib-1.4.0.jar"
fetch dx.jar        "https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/14.0.0_r21/dalvik-dx-14.0.0_r21.jar"
fetch android.jar   "https://repo1.maven.org/maven2/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar"

echo "[2/6] 자바 컴파일"
rm -rf "$OUT/classes"; mkdir -p "$OUT/classes"
# robolectric 의 android-all 에는 java.* 가 들어 있지 않으므로 부트클래스패스로
# 쓸 수 없다. JDK 의 자바 8 API + android.jar 조합으로 컴파일한다.
javac -nowarn -Xlint:-options --release 8 \
  -cp "$DEPS/android.jar" \
  -d "$OUT/classes" $(find "$HERE/src" -name '*.java')

echo "[3/6] dex 변환"
java -cp "$DEPS/dx.jar" com.android.dx.command.Main \
  --dex --min-sdk-version=$MINSDK --output="$OUT/classes.dex" "$OUT/classes"

echo "[4/6] 바이너리 AndroidManifest.xml 생성"
rm -rf "$OUT/tools"; mkdir -p "$OUT/tools"
javac -nowarn -encoding UTF-8 -cp "$DEPS/arsclib.jar" -d "$OUT/tools" "$HERE/tools/BuildManifest.java"
LABEL_B64=$(printf '%s' "$LABEL" | base64 -w0)
java -Dfile.encoding=UTF-8 -cp "$DEPS/arsclib.jar:$OUT/tools" BuildManifest \
  "$PKG" "$LABEL_B64" "$VCODE" "$VNAME" "$MINSDK" "$TARGETSDK" "$OUT/AndroidManifest.xml"

echo "[5/6] 웹 자산 담기"
rm -rf "$OUT/apk"; mkdir -p "$OUT/apk/assets/www"
cp -r "$ROOT/index.html" "$ROOT/styles.css" "$ROOT/manifest.webmanifest" "$ROOT/icon.svg" "$ROOT/src" "$OUT/apk/assets/www/"
cp "$OUT/AndroidManifest.xml" "$OUT/apk/"
cp "$OUT/classes.dex" "$OUT/apk/"
( cd "$OUT/apk" && rm -f "$OUT/app-unsigned.apk" && zip -qrX "$OUT/app-unsigned.apk" AndroidManifest.xml classes.dex assets )

echo "[6/6] 서명"
KS="$DEPS/debug.keystore"
if [ ! -s "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Android Debug, OU=drivingtest, O=drivingtest, C=KR" >/dev/null 2>&1
fi
cp "$OUT/app-unsigned.apk" "$OUT/drivingtest.apk"
jarsigner -keystore "$KS" -storepass android -keypass android \
  -digestalg SHA-256 -sigalg SHA256withRSA \
  "$OUT/drivingtest.apk" androiddebugkey >/dev/null
jarsigner -verify "$OUT/drivingtest.apk" >/dev/null && echo "  서명 확인 완료"

echo
echo "완성: $OUT/drivingtest.apk  ($(du -h "$OUT/drivingtest.apk" | cut -f1))"
