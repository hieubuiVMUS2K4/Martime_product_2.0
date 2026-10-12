import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:intl/intl.dart';
import '../../../data/models/crew_member.dart';
import '../../../data/repositories/crew_repository.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/network_info.dart';
import '../../../core/cache/cache_manager.dart';
import '../../widgets/common/loading_widget.dart';
import '../../widgets/common/error_widget.dart';
import '../../../l10n/app_localizations.dart';

class CertificatesScreen extends StatefulWidget {
  const CertificatesScreen({super.key});

  @override
  State<CertificatesScreen> createState() => _CertificatesScreenState();
}

class _CertificatesScreenState extends State<CertificatesScreen> {
  late Future<CrewMember?> _profileFuture;
  late CrewRepository _crewRepository;

  @override
  void initState() {
    super.initState();
    _crewRepository = CrewRepository(
      apiClient: ApiClient(),
      networkInfo: NetworkInfo(),
      cacheManager: CacheManager(),
    );
    _loadProfile();
  }

  void _loadProfile() {
    _profileFuture = _crewRepository.getMyProfile(forceRefresh: true)
        .then((value) => value as CrewMember?)
        .catchError((e) {
      print('Certificates error: $e');
      return null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myCertificates),
      ),
      body: FutureBuilder<CrewMember?>(
        future: _profileFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return Center(child: LoadingWidget(message: l10n.loadingCertificates));
          }

          if (snapshot.hasError) {
            return ErrorDisplayWidget(
              message: l10n.failedToLoadCertificates,
              onRetry: () {
                setState(() {
                  _loadProfile();
                });
              },
            );
          }

          final profile = snapshot.data;
          if (profile == null) {
            return ErrorDisplayWidget(message: l10n.noCertificateDataFound);
          }

          return RefreshIndicator(
            onRefresh: () async {
              setState(() {
                _loadProfile();
              });
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Warning Banner
                if (_hasExpiringOrExpiredCertificates(profile))
                  _buildWarningBanner(profile),

                // STCW Certificate
                _buildCertificateCard(
                  context,
                  title: l10n.stcwCertificate,
                  icon: Icons.card_membership,
                  number: profile.certificateNumber,
                  issueDate: profile.certificateIssue,
                  expiryDate: profile.certificateExpiry,
                  isExpiring: profile.isCertificateExpiring,
                  isExpired: profile.isCertificateExpired,
                ),

                // Medical Certificate
                _buildCertificateCard(
                  context,
                  title: l10n.medicalCertificate,
                  icon: Icons.medical_services,
                  issueDate: profile.medicalIssue,
                  expiryDate: profile.medicalExpiry,
                  isExpiring: profile.isMedicalExpiring,
                  isExpired: profile.isMedicalExpired,
                ),

                // Passport
                _buildCertificateCard(
                  context,
                  title: l10n.passport,
                  icon: Icons.badge,
                  number: profile.passportNumber,
                  expiryDate: profile.passportExpiry,
                  isExpiring: profile.isPassportExpiring,
                  isExpired: profile.isPassportExpired,
                ),

                // Visa
                if (profile.visaNumber != null || profile.visaExpiry != null)
                  _buildCertificateCard(
                    context,
                    title: l10n.visa,
                    icon: Icons.flight,
                    number: profile.visaNumber,
                    expiryDate: profile.visaExpiry,
                    isExpiring: false,
                    isExpired: false,
                  ),

                // Seaman Book
                if (profile.seamanBookNumber != null)
                  _buildCertificateCard(
                    context,
                    title: l10n.seamanBook,
                    icon: Icons.menu_book,
                    number: profile.seamanBookNumber,
                    isExpiring: false,
                    isExpired: false,
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  bool _hasExpiringOrExpiredCertificates(CrewMember profile) {
    return profile.isCertificateExpiring ||
        profile.isCertificateExpired ||
        profile.isMedicalExpiring ||
        profile.isMedicalExpired ||
        profile.isPassportExpiring ||
        profile.isPassportExpired;
  }

  Widget _buildWarningBanner(CrewMember profile) {
    final l10n = AppLocalizations.of(context);
    final expiredCount = [
      profile.isCertificateExpired,
      profile.isMedicalExpired,
      profile.isPassportExpired,
    ].where((e) => e).length;

    final expiringCount = [
      profile.isCertificateExpiring,
      profile.isMedicalExpiring,
      profile.isPassportExpiring,
    ].where((e) => e).length;

    Color bgColor = MaritimeTheme.warningSoft;
    Color borderColor = MaritimeTheme.warningBorder;
    Color textColor = MaritimeTheme.warning;
    IconData icon = Icons.warning_amber_rounded;
    String message = '';

    if (expiredCount > 0) {
      bgColor = MaritimeTheme.errorSoft;
      borderColor = MaritimeTheme.errorBorder;
      textColor = MaritimeTheme.error;
      icon = Icons.error_outline;
      message = l10n.certificatesExpired(expiredCount);
    } else if (expiringCount > 0) {
      message = l10n.certificatesExpiringSoon(expiringCount);
    }

    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, color: textColor),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: textColor,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCertificateCard(
    BuildContext context, {
    required String title,
    required IconData icon,
    String? number,
    String? issueDate,
    String? expiryDate,
    required bool isExpiring,
    required bool isExpired,
  }) {
    final l10n = AppLocalizations.of(context);
    final dateFormat = DateFormat('dd MMM yyyy');

    Color? statusColor;
    String? statusText;
    IconData? statusIcon;

    if (isExpired) {
      statusColor = MaritimeTheme.error;
      statusText = l10n.expired.toUpperCase();
      statusIcon = Icons.error;
    } else if (isExpiring) {
      statusColor = MaritimeTheme.warning;
      statusText = l10n.expiringSoon.toUpperCase();
      statusIcon = Icons.warning;
    } else if (expiryDate != null) {
      statusColor = MaritimeTheme.success;
      statusText = l10n.valid.toUpperCase();
      statusIcon = Icons.check_circle;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
                if (statusText != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor!.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: statusColor),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(statusIcon, size: 14, color: statusColor),
                        const SizedBox(width: 4),
                        Text(
                          statusText,
                          style: TextStyle(
                            color: statusColor,
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            if (number != null || issueDate != null || expiryDate != null) ...[
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 12),
            ],
            if (number != null)
              _buildInfoRow(l10n.number, number),
            if (issueDate != null)
              _buildInfoRow(
                l10n.issued,
                dateFormat.format(DateTime.parse(issueDate)),
              ),
            if (expiryDate != null) ...[
              _buildInfoRow(
                l10n.expires,
                dateFormat.format(DateTime.parse(expiryDate)),
              ),
              if (!isExpired) ...[
                const SizedBox(height: 4),
                _buildDaysRemaining(expiryDate),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: TextStyle(
                color: MaritimeTheme.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDaysRemaining(String expiryDate) {
    final l10n = AppLocalizations.of(context);
    final expiry = DateTime.parse(expiryDate);
    final daysLeft = expiry.difference(DateTime.now()).inDays;

    return Row(
      children: [
        const SizedBox(width: 80),
        Expanded(
          child: Text(
            l10n.daysRemaining(daysLeft),
            style: TextStyle(
              color: daysLeft <= 90
                  ? MaritimeTheme.warning
                  : MaritimeTheme.textSecondary,
              fontSize: 12,
              fontStyle: FontStyle.italic,
            ),
          ),
        ),
      ],
    );
  }
}
