import com.reandroid.arsc.chunk.xml.ResXmlAttribute;
import com.reandroid.arsc.chunk.xml.ResXmlDocument;
import com.reandroid.arsc.chunk.xml.ResXmlElement;
import com.reandroid.arsc.value.ValueType;

import java.io.File;

// 바이너리 AndroidManifest.xml 을 만든다.
//
// APK 의 매니페스트는 평문 XML 이 아니라 AXML(바이너리 XML)이어야 한다. 보통은
// aapt2 가 변환해 주는데, 이 환경에서는 안드로이드 SDK 배포처(dl.google.com)가
// 막혀 있어 aapt2 를 받을 수 없다. 그래서 ARSCLib(Maven Central 에 있는 순수 자바
// 라이브러리)로 AXML 을 직접 써 낸다.
//
// android: 속성은 이름만으로는 안 되고 프레임워크 리소스 ID 를 함께 넣어야 한다.
// 아래 상수들은 공개된 android.R.attr 값이다.
public class BuildManifest {

    static final int ATTR_NAME             = 0x01010003;
    static final int ATTR_LABEL            = 0x01010001;
    static final int ATTR_EXPORTED         = 0x01010010;
    static final int ATTR_SCREEN_ORIENT    = 0x0101001e;
    static final int ATTR_CONFIG_CHANGES   = 0x0101001f;
    static final int ATTR_MIN_SDK          = 0x0101020c;
    static final int ATTR_TARGET_SDK       = 0x01010270;
    static final int ATTR_VERSION_CODE     = 0x0101021b;
    static final int ATTR_VERSION_NAME     = 0x0101021c;
    static final int ATTR_ALLOW_BACKUP     = 0x01010280;
    static final int ATTR_HW_ACCEL         = 0x010102d3;

    static final String ANDROID_NS = "http://schemas.android.com/apk/res/android";

    // screenOrientation
    static final int LANDSCAPE = 0;
    // configChanges — 회전이나 창 크기가 바뀌어도 액티비티를 다시 만들지 않게 한다.
    // keyboardHidden|orientation|screenLayout|uiMode|screenSize|smallestScreenSize|density
    static final int CONFIG_CHANGES =
            0x0020 | 0x0080 | 0x0100 | 0x0200 | 0x0400 | 0x0800 | 0x1000;   // = 0x1FA0

    public static void main(String[] args) throws Exception {
        String pkg = args[0];
        // 라벨은 base64(UTF-8) 로 받는다. 명령줄 인자는 로케일에 따라 한글이
        // 깨져 들어오기 때문에(POSIX 로케일이면 통째로 '?' 가 된다) 순수 ASCII 로 넘긴다.
        String label = new String(java.util.Base64.getDecoder().decode(args[1]), "UTF-8");
        int versionCode = Integer.parseInt(args[2]);
        String versionName = args[3];
        int minSdk = Integer.parseInt(args[4]);
        int targetSdk = Integer.parseInt(args[5]);
        File out = new File(args[6]);

        ResXmlDocument doc = new ResXmlDocument();
        ResXmlElement manifest = doc.getDocumentElement();
        manifest.setName("manifest");
        manifest.getOrCreateNamespace(ANDROID_NS, "android");

        // package 는 네임스페이스 없는 평문 속성이다
        ResXmlAttribute pkgAttr = manifest.newAttribute();
        pkgAttr.setName("package", 0);
        pkgAttr.setValueAsString(pkg);
        intAttr(manifest, "versionCode", ATTR_VERSION_CODE, versionCode);
        strAttr(manifest, "versionName", ATTR_VERSION_NAME, versionName);

        ResXmlElement usesSdk = manifest.newElement("uses-sdk");
        intAttr(usesSdk, "minSdkVersion", ATTR_MIN_SDK, minSdk);
        intAttr(usesSdk, "targetSdkVersion", ATTR_TARGET_SDK, targetSdk);

        ResXmlElement app = manifest.newElement("application");
        strAttr(app, "label", ATTR_LABEL, label);
        boolAttr(app, "allowBackup", ATTR_ALLOW_BACKUP, false);
        boolAttr(app, "hardwareAccelerated", ATTR_HW_ACCEL, true);

        ResXmlElement act = app.newElement("activity");
        strAttr(act, "name", ATTR_NAME, pkg + ".MainActivity");
        strAttr(act, "label", ATTR_LABEL, label);
        boolAttr(act, "exported", ATTR_EXPORTED, true);
        intAttr(act, "screenOrientation", ATTR_SCREEN_ORIENT, LANDSCAPE);
        intAttr(act, "configChanges", ATTR_CONFIG_CHANGES, CONFIG_CHANGES);

        ResXmlElement filter = act.newElement("intent-filter");
        strAttr(filter.newElement("action"), "name", ATTR_NAME, "android.intent.action.MAIN");
        strAttr(filter.newElement("category"), "name", ATTR_NAME, "android.intent.category.LAUNCHER");

        doc.refresh();
        doc.writeBytes(out);
        System.out.println("AndroidManifest.xml  " + out.length() + " bytes");

        // 써 낸 것을 다시 읽어 구조를 확인한다
        ResXmlDocument back = new ResXmlDocument();
        back.readBytes(out);
        ResXmlElement m = back.getDocumentElement();
        ResXmlAttribute pk = m.searchAttributeByName("package");
        System.out.println("검증: <" + m.getName() + "> package="
                + (pk == null ? "(없음)" : pk.getValueAsString())
                + " / activity=" + findActivityName(m)
                + " / minSdk=" + sdk(m, ATTR_MIN_SDK) + " targetSdk=" + sdk(m, ATTR_TARGET_SDK));
    }

    static String sdk(ResXmlElement manifest, int id) {
        ResXmlElement u = manifest.getElement("uses-sdk");
        if (u == null) return "?";
        ResXmlAttribute a = u.searchAttributeByResourceId(id);
        return a == null ? "?" : String.valueOf(a.getData());
    }

    static String findActivityName(ResXmlElement manifest) {
        ResXmlElement app = manifest.getElement("application");
        if (app == null) return "(없음)";
        ResXmlElement act = app.getElement("activity");
        if (act == null) return "(없음)";
        ResXmlAttribute a = act.searchAttributeByResourceId(ATTR_NAME);
        return a == null ? "(없음)" : a.getValueAsString();
    }

    static void strAttr(ResXmlElement el, String name, int id, String value) {
        ResXmlAttribute a = el.getOrCreateAndroidAttribute(name, id);
        a.setValueAsString(value);
    }
    static void intAttr(ResXmlElement el, String name, int id, int value) {
        ResXmlAttribute a = el.getOrCreateAndroidAttribute(name, id);
        a.setValueType(ValueType.DEC);
        a.setData(value);
    }
    static void boolAttr(ResXmlElement el, String name, int id, boolean value) {
        ResXmlAttribute a = el.getOrCreateAndroidAttribute(name, id);
        a.setValueAsBoolean(value);
    }
}
