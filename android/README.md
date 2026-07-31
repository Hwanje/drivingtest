# 안드로이드 APK

웹 시뮬레이터를 전체 화면 WebView 로 감싼 앱입니다. 자산이 APK 안에 들어 있어
설치 후 인터넷 없이 동작합니다.

```
bash android/build.sh      →  android/build/drivingtest.apk
```

설치는 파일을 폰으로 옮긴 뒤 "출처를 알 수 없는 앱 설치"를 허용하고 열면 됩니다.
`adb install -r android/build/drivingtest.apk` 도 됩니다.

| 항목 | 값 |
|---|---|
| 패키지 | `kr.drivingtest` |
| minSdk / targetSdk | 21 (안드로이드 5.0) / 28 |
| 화면 | 가로 고정 · 전체 화면 |
| 서명 | 디버그 키(v1). 첫 빌드 때 `android/.deps/debug.keystore` 를 만듭니다 |

## 왜 Gradle 을 안 쓰나

이 저장소가 만들어진 개발 환경은 `dl.google.com` 으로 나가는 트래픽이 막혀
있습니다. 안드로이드 SDK(aapt2 · d8 · platform android.jar)와 Android Gradle
Plugin 은 전부 그 호스트에서만 배포되기 때문에, 표준 Gradle 빌드를 돌릴 수가
없습니다. `maven.google.com` 도 결국 `dl.google.com` 으로 302 로 넘깁니다.

그래서 **Maven Central 에서 받을 수 있는 것들만으로** 빌드 파이프라인을 짰습니다.

| 단계 | 도구 | 출처 |
|---|---|---|
| 자바 컴파일 | `javac` (JDK 21, `--release 8`) | JDK |
| 안드로이드 API | `org.robolectric:android-all` (API 34) | Maven Central |
| dex 변환 | `com.jakewharton.android.repackaged:dalvik-dx` | Maven Central |
| 바이너리 매니페스트 | `io.github.reandroid:ARSCLib` | Maven Central |
| 묶기 · 서명 | `zip`, `jarsigner` | OS / JDK |

APK 의 `AndroidManifest.xml` 은 평문 XML 이 아니라 AXML(바이너리 XML)이어야
합니다. 보통 aapt2 가 해 주는 변환인데, 여기서는 `tools/BuildManifest.java` 가
ARSCLib 로 직접 써 냅니다. `android:` 속성은 이름만으로 안 되고 프레임워크
리소스 ID 를 함께 넣어야 해서, 공개된 `android.R.attr` 값을 상수로 박아 두었습니다.

리소스 디렉터리(`res/`)는 쓰지 않습니다. aapt2 없이는 `resources.arsc` 를
만들 수 없기 때문입니다. 그래서
- 앱 아이콘은 안드로이드 기본 아이콘입니다.
- 테마 대신 코드에서 타이틀바를 없애고 전체 화면으로 만듭니다(`MainActivity`).

`targetSdk` 를 28 로 둔 이유는 서명 방식 때문입니다. 안드로이드 11 이상은
targetSdk 30 이상인 앱에 v2 이상 서명을 요구하는데, 여기서는 `jarsigner` 로
v1 서명만 합니다. 28 이면 최신 안드로이드에서도 사이드로딩 설치가 됩니다.

## 안드로이드 SDK 가 있다면

표준 Gradle 프로젝트로 옮기는 편이 낫습니다. `assets/www` 에 저장소 루트의
`index.html` · `styles.css` · `src/` · `manifest.webmanifest` · `icon.svg` 를 넣고,
`src/kr/drivingtest/MainActivity.java` 를 그대로 쓰면 됩니다. 그러면 아이콘 ·
적응형 아이콘 · v2/v3 서명 · targetSdk 34 를 정상적으로 붙일 수 있습니다.

## 확인한 것 / 확인하지 못한 것

빌드 산출물은 다음을 확인했습니다.

- `net.dongliu:apk-parser`(ARSCLib 과 무관한 별개 구현)로 APK 를 다시 열어
  패키지명 · 라벨 · 버전 · minSdk/targetSdk · 액티비티 · `intent-filter` 가
  의도대로 들어갔음을 확인
- `configChanges=0x1FA0`, `screenOrientation=0`(가로), 라벨이 UTF-8 한글로
  저장된 것을 바이트 단위로 확인
- `classes.dex` 헤더가 `dex\n035` 인 것과 `jarsigner -verify` 통과

**실제 안드로이드 기기에서 설치·실행해 보지는 못했습니다.** 이 환경에는 기기도
에뮬레이터도 없습니다(에뮬레이터 이미지 역시 `dl.google.com` 배포입니다).
설치가 안 되거나 흰 화면이 뜨면 알려 주세요.
