import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/env.dart';
import '../../core/data/data_revision.dart';
import '../../core/icons/app_icons.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../mock/demo_accounts.dart';
import '../../mock/dev_tools.dart';

/// Công cụ phát triển (chỉ chế độ mock): giả lập lỗi mạng / máy chủ, mạng chậm,
/// tự xác nhận thanh toán; danh sách tài khoản demo; Gallery component.
class DevToolsScreen extends ConsumerStatefulWidget {
  const DevToolsScreen({super.key});

  @override
  ConsumerState<DevToolsScreen> createState() => _DevToolsScreenState();
}

class _DevToolsScreenState extends ConsumerState<DevToolsScreen> {
  @override
  Widget build(BuildContext context) {
    if (!Env.useMock) {
      return const AppScaffold(
        title: 'Công cụ phát triển',
        body: EmptyState(title: 'Chỉ có ở chế độ mock'),
      );
    }
    final settings = ref.read(mockDevToolsProvider).settings;
    void toggle(void Function() change) {
      setState(change);
      ref.read(dataRevisionProvider.notifier).bump();
    }

    return AppScaffold(
      title: 'Công cụ phát triển',
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          const AlertBanner.info(message: 'Dữ liệu là mock trong bộ nhớ — khởi động lại app để về dữ liệu ban đầu.'),
          const SizedBox(height: AppSpacing.md),
          const SectionHeader(title: 'Giả lập mạng'),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                SwitchListTile.adaptive(
                  title: const Text('Lỗi mất kết nối'),
                  subtitle: const Text('Mọi request ném lỗi mạng ⇒ kiểm tra màn lỗi + Thử lại'),
                  value: settings.networkError,
                  onChanged: (v) => toggle(() => settings.networkError = v),
                ),
                const Divider(),
                SwitchListTile.adaptive(
                  title: const Text('Lỗi máy chủ (500)'),
                  value: settings.serverError,
                  onChanged: (v) => toggle(() => settings.serverError = v),
                ),
                const Divider(),
                SwitchListTile.adaptive(
                  title: const Text('Mạng chậm (1.5–2.5 giây)'),
                  subtitle: const Text('Kiểm tra skeleton loading'),
                  value: settings.slowNetwork,
                  onChanged: (v) => toggle(() => settings.slowNetwork = v),
                ),
                const Divider(),
                SwitchListTile.adaptive(
                  title: const Text('Tự xác nhận thanh toán sau ~20 giây'),
                  value: settings.autoConfirmPayments,
                  onChanged: (v) => toggle(() => settings.autoConfirmPayments = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const SectionHeader(title: 'Tài khoản demo'),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final a in demoAccounts) KeyValueRow(label: a.label, value: a.email),
                const Divider(),
                KeyValueRow(label: 'Mật khẩu chung', value: demoAccounts.first.password),
                const KeyValueRow(label: 'OTP đặt lại mật khẩu', value: kDemoOtp),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const SectionHeader(title: 'Gallery component'),
          const _Gallery(),
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}

class _Gallery extends StatefulWidget {
  const _Gallery();

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _rating = 4;
  int _qty = 1;
  int _seg = 0;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Màu', style: context.text.label),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            for (final (name, color) in [
              ('primary', c.primary),
              ('accent', c.accent),
              ('accentStrong', c.accentStrong),
              ('background', c.background),
              ('surface', c.surface),
              ('border', c.border),
              ('text', c.text),
              ('textMuted', c.textMuted),
            ])
              Column(
                children: [
                  Container(
                    width: AppSpacing.xxl,
                    height: AppSpacing.xxl,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: AppRadius.controlAll,
                      border: Border.all(color: c.border),
                    ),
                  ),
                  Text(name, style: context.text.micro.copyWith(color: c.textMuted)),
                ],
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Text('Chữ', style: context.text.label),
        Text('Display 32', style: context.text.display),
        Text('Headline 24', style: context.text.headline),
        Text('Title 20', style: context.text.title),
        Text('Body 16 — Be Vietnam Pro: Tiếng Việt có dấu đầy đủ', style: context.text.body),
        Text('Caption 12', style: context.text.caption),
        const SizedBox(height: AppSpacing.md),
        Text('Nút', style: context.text.label),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            AppButton(label: 'Primary', onPressed: () {}),
            AppButton.secondary(label: 'Secondary', onPressed: () {}),
            AppButton.outline(label: 'Outline', onPressed: () {}),
            AppButton.ghost(label: 'Ghost', onPressed: () {}),
            AppButton.danger(label: 'Danger', onPressed: () {}),
            const AppButton(label: 'Disabled', onPressed: null),
            AppButton(label: 'Loading', loading: true, onPressed: () {}),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Text('Trạng thái', style: context.text.label),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [for (final t in StatusTone.values) StatusTag(label: t.name, tone: t)],
        ),
        const SizedBox(height: AppSpacing.md),
        const AlertBanner.info(title: 'Info', message: 'Thông tin chung.'),
        const SizedBox(height: AppSpacing.xs),
        const AlertBanner.success(message: 'Thành công.'),
        const SizedBox(height: AppSpacing.xs),
        const AlertBanner.warning(message: 'Cảnh báo.'),
        const SizedBox(height: AppSpacing.xs),
        const AlertBanner.error(message: 'Lỗi.'),
        const SizedBox(height: AppSpacing.md),
        SegmentedTabs<int>(
          padding: EdgeInsets.zero,
          selected: _seg,
          onChanged: (v) => setState(() => _seg = v),
          options: const [SegmentOption(0, 'Tab 1', count: 3), SegmentOption(1, 'Tab 2'), SegmentOption(2, 'Tab 3')],
        ),
        const SizedBox(height: AppSpacing.md),
        RatingInput(value: _rating, onChanged: (v) => setState(() => _rating = v)),
        QuantityStepper(value: _qty, max: 5, onChanged: (v) => setState(() => _qty = v)),
        const SizedBox(height: AppSpacing.md),
        const AppTextField(label: 'Ô nhập', hint: 'Gợi ý', helper: 'Trợ giúp'),
        const SizedBox(height: AppSpacing.xs),
        const AppTextField(label: 'Ô lỗi', errorText: 'Thông báo lỗi'),
        const SizedBox(height: AppSpacing.md),
        const LabeledProgress(value: 6, total: 12, label: 'Tiến độ'),
        const SizedBox(height: AppSpacing.md),
        const Shimmer(child: SkeletonCard()),
        const EmptyState(compact: true, title: 'Trạng thái rỗng', message: 'Mô tả ngắn.', icon: AppIcons.empty),
      ],
    );
  }
}
