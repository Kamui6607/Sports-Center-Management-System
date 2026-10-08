import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Bộ icon của app (Q14). Màn hình CHỈ dùng `AppIcons.xxx`; đổi bộ icon chỉ
/// cần sửa file này.
abstract final class AppIcons {
  // Thương hiệu
  static const IconData brand = LucideIcons.activity;

  // Điều hướng
  static const IconData home = LucideIcons.house;
  static const IconData dashboard = LucideIcons.layoutDashboard;
  static const IconData course = LucideIcons.bookOpen;
  static const IconData schedule = LucideIcons.calendarDays;
  static const IconData calendar = LucideIcons.calendar;
  static const IconData shop = LucideIcons.store;
  static const IconData account = LucideIcons.circleUser;
  static const IconData wallet = LucideIcons.wallet;
  static const IconData approvals = LucideIcons.clipboardList;
  static const IconData back = LucideIcons.arrowLeft;
  static const IconData chevronRight = LucideIcons.chevronRight;
  static const IconData chevronLeft = LucideIcons.chevronLeft;
  static const IconData chevronDown = LucideIcons.chevronDown;
  static const IconData more = LucideIcons.ellipsisVertical;
  static const IconData close = LucideIcons.x;

  // Giao tiếp
  static const IconData notification = LucideIcons.bell;
  static const IconData chat = LucideIcons.messageCircle;
  static const IconData chatMany = LucideIcons.messagesSquare;
  static const IconData send = LucideIcons.send;
  static const IconData attach = LucideIcons.paperclip;
  static const IconData image = LucideIcons.image;
  static const IconData file = LucideIcons.fileText;
  static const IconData read = LucideIcons.checkCheck;

  // Hành động
  static const IconData search = LucideIcons.search;
  static const IconData filter = LucideIcons.slidersHorizontal;
  static const IconData add = LucideIcons.plus;
  static const IconData remove = LucideIcons.minus;
  static const IconData edit = LucideIcons.pencil;
  static const IconData delete = LucideIcons.trash2;
  static const IconData copy = LucideIcons.copy;
  static const IconData download = LucideIcons.download;
  static const IconData share = LucideIcons.share2;
  static const IconData refresh = LucideIcons.rotateCcw;
  static const IconData upload = LucideIcons.cloudUpload;
  static const IconData logout = LucideIcons.logOut;
  static const IconData check = LucideIcons.check;
  static const IconData transfer = LucideIcons.arrowRightLeft;
  static const IconData undo = LucideIcons.undo2;
  static const IconData settings = LucideIcons.settings;

  // Nghiệp vụ
  static const IconData qr = LucideIcons.qrCode;
  static const IconData scan = LucideIcons.scanLine;
  static const IconData keyboard = LucideIcons.keyboard;
  static const IconData flash = LucideIcons.flashlight;
  static const IconData flashOff = LucideIcons.flashlightOff;
  static const IconData camera = LucideIcons.camera;
  static const IconData time = LucideIcons.clock;
  static const IconData location = LucideIcons.mapPin;
  static const IconData users = LucideIcons.users;
  static const IconData user = LucideIcons.user;
  static const IconData training = LucideIcons.dumbbell;
  static const IconData payment = LucideIcons.creditCard;
  static const IconData invoice = LucideIcons.receipt;
  static const IconData money = LucideIcons.banknote;
  static const IconData bank = LucideIcons.landmark;
  static const IconData order = LucideIcons.package;
  static const IconData bag = LucideIcons.shoppingBag;
  static const IconData star = LucideIcons.star;

  /// Sao đặc cho hiển thị điểm đánh giá (Lucide chỉ có sao viền).
  static const IconData starFilled = Icons.star_rounded;
  static const IconData refund = LucideIcons.undo2;
  static const IconData attendance = LucideIcons.calendarCheck;
  static const IconData sessionCancelled = LucideIcons.calendarX;
  static const IconData ban = LucideIcons.ban;
  static const IconData verified = LucideIcons.shieldCheck;
  static const IconData trend = LucideIcons.trendingUp;
  static const IconData target = LucideIcons.target;
  static const IconData award = LucideIcons.award;
  static const IconData sparkles = LucideIcons.sparkles;
  static const IconData pending = LucideIcons.hourglass;
  static const IconData cv = LucideIcons.fileCheck;
  static const IconData web = LucideIcons.monitor;
  static const IconData lock = LucideIcons.lock;
  static const IconData mail = LucideIcons.mail;
  static const IconData phone = LucideIcons.phone;
  static const IconData eye = LucideIcons.eye;
  static const IconData eyeOff = LucideIcons.eyeOff;
  static const IconData graduation = LucideIcons.graduationCap;
  static const IconData zap = LucideIcons.zap;

  // Trạng thái
  static const IconData success = LucideIcons.circleCheck;
  static const IconData error = LucideIcons.circleX;
  static const IconData alert = LucideIcons.circleAlert;
  static const IconData warning = LucideIcons.triangleAlert;
  static const IconData info = LucideIcons.info;
  static const IconData offline = LucideIcons.wifiOff;
  static const IconData serverError = LucideIcons.serverCrash;
  static const IconData empty = LucideIcons.inbox;
}
