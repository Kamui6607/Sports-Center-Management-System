import 'package:flutter/material.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/banking_app.dart';
import '../../domain/entities/payment.dart';
import '../../services/bank_launcher_service.dart';

/// BottomSheet chọn ứng dụng ngân hàng để mở App-to-App qua VietQR.
class BankAppPickerSheet extends StatefulWidget {
  const BankAppPickerSheet({super.key, required this.checkout});

  final Checkout checkout;

  static Future<void> show({
    required BuildContext context,
    required Checkout checkout,
  }) {
    return showAppBottomSheet(
      context: context,
      title: 'Chọn ứng dụng ngân hàng',
      subtitle: 'Mở app chuyển tiền trực tiếp hoặc sao chép thông tin',
      expand: true,
      builder: (_) => BankAppPickerSheet(checkout: checkout),
    );
  }

  @override
  State<BankAppPickerSheet> createState() => _BankAppPickerSheetState();
}

class _BankAppPickerSheetState extends State<BankAppPickerSheet> {
  String _query = '';
  List<BankingApp> _installed = [];

  @override
  void initState() {
    super.initState();
    _detectInstalled();
  }

  Future<void> _detectInstalled() async {
    final list = await BankLauncherService.getInstalledApps();
    if (mounted) {
      setState(() {
        _installed = list;
      });
    }
  }

  List<BankingApp> get _filteredApps {
    final q = _query.toLowerCase().trim();
    if (q.isEmpty) return BankingApp.supportedApps;
    return BankingApp.supportedApps.where((app) {
      return app.name.toLowerCase().contains(q) ||
          app.shortName.toLowerCase().contains(q) ||
          app.appId.toLowerCase().contains(q);
    }).toList();
  }

  void _onSelectApp(BankingApp app) {
    Navigator.of(context).pop();
    BankLauncherService.launchApp(
      context: context,
      app: app,
      checkout: widget.checkout,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final apps = _filteredApps;
    final isSearching = _query.isNotEmpty;

    // Phân loại đã cài đặt nếu không trong chế độ tìm kiếm
    final installedIds = _installed.map((a) => a.appId).toSet();
    final installedList = apps.where((a) => installedIds.contains(a.appId)).toList();
    final otherList = apps.where((a) => !installedIds.contains(a.appId)).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SearchField(
          hint: 'Tìm theo tên (MB, VCB, Techcombank...)',
          onChanged: (val) => setState(() => _query = val),
        ),
        const SizedBox(height: AppSpacing.md),

        // Nút sao chép toàn bộ thông tin nhanh
        AppButton.ghost(
          label: 'Sao chép toàn bộ thông tin chuyển khoản',
          icon: AppIcons.copy,
          expand: true,
          size: AppButtonSize.small,
          onPressed: () {
            Navigator.of(context).pop();
            BankLauncherService.copyAllInfo(context, widget.checkout);
          },
        ),
        const SizedBox(height: AppSpacing.sm),

        if (apps.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
            child: Center(
              child: Text(
                'Không tìm thấy ngân hàng phù hợp.',
                style: context.text.body.copyWith(color: c.textMuted),
              ),
            ),
          )
        else ...[
          // Nhóm ứng dụng đã cài đặt trên máy
          if (!isSearching && installedList.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Text(
                'Ứng dụng trên máy của bạn',
                style: context.text.label.copyWith(color: c.primary),
              ),
            ),
            for (final app in installedList) ...[
              _BankAppTile(
                app: app,
                isInstalled: true,
                onTap: () => _onSelectApp(app),
              ),
              const SizedBox(height: AppSpacing.xs),
            ],
            const SizedBox(height: AppSpacing.sm),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Text(
                'Tất cả ngân hàng hỗ trợ',
                style: context.text.label.copyWith(color: c.textMuted),
              ),
            ),
          ],

          // Nhóm ngân hàng khác
          for (final app in (isSearching ? apps : otherList)) ...[
            _BankAppTile(
              app: app,
              isInstalled: installedIds.contains(app.appId),
              onTap: () => _onSelectApp(app),
            ),
            const SizedBox(height: AppSpacing.xs),
          ],
        ],
      ],
    );
  }
}

class _BankAppTile extends StatelessWidget {
  const _BankAppTile({
    required this.app,
    required this.isInstalled,
    required this.onTap,
  });

  final BankingApp app;
  final bool isInstalled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.cardAll,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            border: Border.all(
              color: isInstalled ? c.primary.withValues(alpha: 0.3) : c.border,
            ),
            borderRadius: AppRadius.cardAll,
            color: isInstalled ? c.primary.withValues(alpha: 0.04) : null,
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: AppRadius.controlAll,
                child: SizedBox(
                  width: AppSizes.avatarSm,
                  height: AppSizes.avatarSm,
                  child: Image.network(
                    app.logoUrl,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => Container(
                      color: c.surfaceMuted,
                      child: Icon(AppIcons.bank, size: AppSizes.iconSm, color: c.textMuted),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(app.shortName, style: context.text.bodyStrong),
                        if (isInstalled) ...[
                          const SizedBox(width: AppSpacing.xs),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: c.accent.withValues(alpha: 0.12),
                              borderRadius: AppRadius.pillAll,
                            ),
                            child: Text(
                              'Đã cài',
                              style: context.text.caption.copyWith(
                                color: c.accent,
                                fontWeight: FontWeight.w600,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    Text(
                      app.name,
                      style: context.text.small.copyWith(color: c.textMuted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (app.autofill)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.surfaceMuted,
                    borderRadius: AppRadius.pillAll,
                    border: Border.all(color: c.border),
                  ),
                  child: Text(
                    'Tự điền',
                    style: context.text.caption.copyWith(
                      color: c.textMuted,
                      fontSize: 10,
                    ),
                  ),
                ),
              const SizedBox(width: AppSpacing.xs),
              Icon(AppIcons.chevronRight, size: AppSizes.iconSm, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
