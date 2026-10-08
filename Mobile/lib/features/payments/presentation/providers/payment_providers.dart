import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/payment_repository_provider.dart';
import '../../domain/entities/payment.dart';

final checkoutProvider = FutureProvider.autoDispose.family<Checkout, String>(
  (ref, paymentId) => ref.watch(paymentRepositoryProvider).checkout(paymentId),
);

/// Ảnh QR của giao dịch — tải một lần theo [paymentId].
final qrImageProvider = FutureProvider.autoDispose.family<Uint8List, String>((ref, paymentId) async {
  final repo = ref.watch(paymentRepositoryProvider);
  return repo.qrImage(await repo.checkout(paymentId));
});

final myInvoicesProvider = FutureProvider.autoDispose<List<Invoice>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(paymentRepositoryProvider).myInvoices();
});

final invoiceProvider = FutureProvider.autoDispose.family<Invoice, String>(
  (ref, id) => ref.watch(paymentRepositoryProvider).invoice(id),
);
