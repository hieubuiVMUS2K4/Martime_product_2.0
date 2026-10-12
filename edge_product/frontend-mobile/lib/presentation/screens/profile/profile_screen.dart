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
import 'certificates_screen.dart';
import '../../../l10n/app_localizations.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
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
      print('Profile error: $e');
      return null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myProfile),
        actions: [
          IconButton(
            icon: const Icon(Icons.card_membership),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const CertificatesScreen(),
                ),
              );
            },
            tooltip: l10n.viewCertificates,
          ),
        ],
      ),
      body: FutureBuilder<CrewMember?>(
        future: _profileFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return Center(child: LoadingWidget(message: l10n.loadingProfile));
          }

          if (snapshot.hasError) {
            return ErrorDisplayWidget(
              message: l10n.failedToLoadProfile,
              onRetry: () {
                setState(() {
                  _loadProfile();
                });
              },
            );
          }

          final profile = snapshot.data;
          if (profile == null) {
            return ErrorDisplayWidget(message: l10n.profileNotFound);
          }

          return RefreshIndicator(
            onRefresh: () async {
              setState(() {
                _loadProfile();
              });
            },
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: Column(
                children: [
                  _buildHeader(profile),
                  _buildPersonalInfo(profile),
                  _buildContactInfo(profile),
                  _buildEmergencyContact(profile),
                  _buildDocuments(profile),
                  _buildEmploymentInfo(profile),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader(CrewMember profile) {
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primaryContainer,
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          CircleAvatar(
            radius: 50,
            backgroundColor: Theme.of(context).colorScheme.primary,
            child: Text(
              profile.fullName.substring(0, 1).toUpperCase(),
              style: TextStyle(
                fontSize: 40,
                color: Theme.of(context).colorScheme.onPrimary,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            profile.fullName,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            profile.position,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                ),
          ),
          const SizedBox(height: 8),
          Chip(
            label: Text(
              '${l10n.crewId}: ${profile.crewId}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPersonalInfo(CrewMember profile) {
    final l10n = AppLocalizations.of(context);
    final dateFormat = DateFormat('dd MMM yyyy');
    return _buildSection(
      title: l10n.personalInformation,
      icon: Icons.person,
      children: [
        if (profile.nationality != null)
          _buildInfoTile(l10n.nationality, profile.nationality!),
        if (profile.dateOfBirth != null)
          _buildInfoTile(
            l10n.dateOfBirth,
            dateFormat.format(DateTime.parse(profile.dateOfBirth!)),
          ),
        if (profile.rank != null) _buildInfoTile(l10n.rank, profile.rank!),
        if (profile.department != null) _buildInfoTile(l10n.department, profile.department!),
      ],
    );
  }

  Widget _buildContactInfo(CrewMember profile) {
    final l10n = AppLocalizations.of(context);
    return _buildSection(
      title: l10n.contactInformation,
      icon: Icons.contact_phone,
      children: [
        if (profile.email != null)
          _buildInfoTile(l10n.email, profile.email!, icon: Icons.email),
        if (profile.phoneNumber != null)
          _buildInfoTile(l10n.phone, profile.phoneNumber!, icon: Icons.phone),
        if (profile.address != null)
          _buildInfoTile(l10n.address, profile.address!, icon: Icons.home),
      ],
    );
  }

  Widget _buildEmergencyContact(CrewMember profile) {
    final l10n = AppLocalizations.of(context);
    if (profile.emergencyContact == null) return const SizedBox.shrink();
    
    return _buildSection(
      title: l10n.emergencyContact,
      icon: Icons.emergency,
      children: [
        _buildInfoTile(l10n.contactInfo, profile.emergencyContact!),
      ],
    );
  }

  Widget _buildDocuments(CrewMember profile) {
    final l10n = AppLocalizations.of(context);
    final dateFormat = DateFormat('dd MMM yyyy');
    return _buildSection(
      title: l10n.documents,
      icon: Icons.badge,
      children: [
        if (profile.passportNumber != null)
          _buildInfoTile(l10n.passportNumber, profile.passportNumber!),
        if (profile.passportExpiry != null)
          _buildInfoTile(
            l10n.passportExpiry,
            dateFormat.format(DateTime.parse(profile.passportExpiry!)),
            trailing: _buildExpiryWarning(profile.isPassportExpiring, profile.isPassportExpired),
          ),
        if (profile.seamanBookNumber != null)
          _buildInfoTile(l10n.seamanBookNumber, profile.seamanBookNumber!),
        if (profile.visaNumber != null)
          _buildInfoTile(l10n.visaNumber, profile.visaNumber!),
        if (profile.visaExpiry != null)
          _buildInfoTile(
            l10n.visaExpiry,
            dateFormat.format(DateTime.parse(profile.visaExpiry!)),
          ),
      ],
    );
  }

  Widget _buildEmploymentInfo(CrewMember profile) {
    final l10n = AppLocalizations.of(context);
    final dateFormat = DateFormat('dd MMM yyyy');
    return _buildSection(
      title: l10n.employment,
      icon: Icons.work,
      children: [
        _buildInfoTile(l10n.status, profile.isOnboard ? l10n.onboard : l10n.offboard),
        if (profile.joinDate != null)
          _buildInfoTile(
            l10n.joinDate,
            dateFormat.format(DateTime.parse(profile.joinDate!)),
          ),
        if (profile.embarkDate != null)
          _buildInfoTile(
            l10n.embarkDate,
            dateFormat.format(DateTime.parse(profile.embarkDate!)),
          ),
        if (profile.disembarkDate != null)
          _buildInfoTile(
            l10n.disembarkDate,
            dateFormat.format(DateTime.parse(profile.disembarkDate!)),
          ),
        if (profile.contractEnd != null)
          _buildInfoTile(
            l10n.contractEnd,
            dateFormat.format(DateTime.parse(profile.contractEnd!)),
          ),
      ],
    );
  }

  Widget _buildSection({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
            const Divider(height: 24),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildInfoTile(String label, String value, {IconData? icon, Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: MaritimeTheme.textSecondary),
            const SizedBox(width: 8),
          ],
          SizedBox(
            width: 120,
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
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  Widget? _buildExpiryWarning(bool isExpiring, bool isExpired) {
    final l10n = AppLocalizations.of(context);
    if (isExpired) {
      return Chip(
        label: Text(l10n.expired, style: const TextStyle(fontSize: 10)),
        backgroundColor: MaritimeTheme.errorSoft,
        labelStyle: TextStyle(color: MaritimeTheme.error),
        padding: EdgeInsets.zero,
      );
    } else if (isExpiring) {
      return Chip(
        label: Text(l10n.expiring, style: const TextStyle(fontSize: 10)),
        backgroundColor: MaritimeTheme.warningSoft,
        labelStyle: TextStyle(color: MaritimeTheme.warning),
        padding: EdgeInsets.zero,
      );
    }
    return null;
  }
}
