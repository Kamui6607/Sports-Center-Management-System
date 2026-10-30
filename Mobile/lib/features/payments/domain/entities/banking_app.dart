/// Thông tin ứng dụng ngân hàng hỗ trợ App-to-App Deep Link qua chuẩn VietQR.
class BankingApp {
  const BankingApp({
    required this.appId,
    required this.name,
    required this.shortName,
    required this.scheme,
    required this.androidPackage,
    required this.logoUrl,
    this.autofill = false,
    this.popular = false,
  });

  /// Mã định danh ngân hàng của VietQR (truyền vào `https://dl.vietqr.io/pay?app=<appId>`).
  final String appId;

  /// Tên đầy đủ hiển thị cho người dùng.
  final String name;

  /// Tên viết tắt.
  final String shortName;

  /// Custom URL scheme để kiểm tra đã cài đặt (`canLaunchUrl`) và mở trực tiếp.
  final String scheme;

  /// Package name trên Android (Play Store).
  final String androidPackage;

  /// Link ảnh logo từ CDN VietQR.
  final String logoUrl;

  /// App có tự động điền sẵn STK, số tiền, nội dung khi mở không.
  final bool autofill;

  /// Ưu tiên hiển thị trên đầu.
  final bool popular;

  /// Danh sách các ứng dụng ngân hàng và ví điện tử phổ biến tại Việt Nam.
  static const List<BankingApp> supportedApps = [
    BankingApp(
      appId: 'mb',
      name: 'MB Bank',
      shortName: 'MB',
      scheme: 'mbmobile://',
      androidPackage: 'com.mbmobile',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/mb-android.webp',
      autofill: true,
      popular: true,
    ),
    BankingApp(
      appId: 'vcb',
      name: 'VCB Digibank',
      shortName: 'Vietcombank',
      scheme: 'vcb://',
      androidPackage: 'com.VCB',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/vcb-android.webp',
      autofill: false,
      popular: true,
    ),
    BankingApp(
      appId: 'tcb',
      name: 'Techcombank Mobile',
      shortName: 'Techcombank',
      scheme: 'tcb://',
      androidPackage: 'com.techcombank.mobile',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/tcb-android.webp',
      autofill: false,
      popular: true,
    ),
    BankingApp(
      appId: 'bidv',
      name: 'BIDV SmartBanking',
      shortName: 'BIDV',
      scheme: 'bidvsmartbanking://',
      androidPackage: 'com.vnpay.bidv',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/bidv-android.webp',
      autofill: true,
      popular: true,
    ),
    BankingApp(
      appId: 'icb',
      name: 'VietinBank iPay',
      shortName: 'VietinBank',
      scheme: 'vietinbankipay://',
      androidPackage: 'com.vietinbank.ipay',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/icb-android.webp',
      autofill: true,
      popular: true,
    ),
    BankingApp(
      appId: 'acb',
      name: 'ACB ONE',
      shortName: 'ACB',
      scheme: 'acbone://',
      androidPackage: 'mobile.acb.com.vn',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/acb-android.webp',
      autofill: true,
      popular: true,
    ),
    BankingApp(
      appId: 'vpb',
      name: 'VPBank NEO',
      shortName: 'VPBank',
      scheme: 'vpbankneo://',
      androidPackage: 'com.vnpay.vpbankonline',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/vpb-android.webp',
      autofill: false,
      popular: true,
    ),
    BankingApp(
      appId: 'tpb',
      name: 'TPBank Mobile',
      shortName: 'TPBank',
      scheme: 'tpbank://',
      androidPackage: 'com.tpbank.mobile',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/tpb-android.webp',
      autofill: false,
      popular: true,
    ),
    BankingApp(
      appId: 'vba',
      name: 'Agribank Plus',
      shortName: 'Agribank',
      scheme: 'agribank://',
      androidPackage: 'com.vnpay.agribank',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/vba-android.webp',
      autofill: false,
      popular: true,
    ),
    BankingApp(
      appId: 'ocb',
      name: 'OCB OMNI',
      shortName: 'OCB',
      scheme: 'ocb://',
      androidPackage: 'com.vnpay.ocb',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/ocb-android.webp',
      autofill: true,
      popular: false,
    ),
    BankingApp(
      appId: 'cake',
      name: 'CAKE by VPBank',
      shortName: 'CAKE',
      scheme: 'cake://',
      androidPackage: 'xyz.be.cake',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/cake-android.webp',
      autofill: false,
      popular: false,
    ),
    BankingApp(
      appId: 'timo',
      name: 'Timo Digital Bank',
      shortName: 'Timo',
      scheme: 'timo://',
      androidPackage: 'vn.timo.mobile',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/timo-android.webp',
      autofill: false,
      popular: false,
    ),
    BankingApp(
      appId: 'shb',
      name: 'SHB SAHA',
      shortName: 'SHB',
      scheme: 'shb://',
      androidPackage: 'com.vnpay.shb',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/shb-android.webp',
      autofill: false,
      popular: false,
    ),
    BankingApp(
      appId: 'hdb',
      name: 'HDBank',
      shortName: 'HDBank',
      scheme: 'hdbank://',
      androidPackage: 'com.vnpay.hdbank',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/hdb-android.webp',
      autofill: false,
      popular: false,
    ),
    BankingApp(
      appId: 'momo',
      name: 'MoMo',
      shortName: 'MoMo',
      scheme: 'momo://',
      androidPackage: 'com.mservice.momotransfer',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/momo-android.webp',
      autofill: false,
      popular: false,
    ),
    BankingApp(
      appId: 'zalopay',
      name: 'ZaloPay',
      shortName: 'ZaloPay',
      scheme: 'zalopay://',
      androidPackage: 'vn.com.vng.zalopay',
      logoUrl: 'https://cdn.vietqr.io/bank-app-icon/zalopay-android.webp',
      autofill: false,
      popular: false,
    ),
  ];
}
