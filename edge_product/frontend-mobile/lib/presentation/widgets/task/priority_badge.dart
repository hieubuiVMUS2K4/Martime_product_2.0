import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';

class PriorityBadge extends StatelessWidget {
  final String priority;
  final bool small;

  const PriorityBadge({
    super.key,
    required this.priority,
    this.small = false,
  });

  @override
  Widget build(BuildContext context) {
    Color color;
    IconData icon;

    switch (priority.toUpperCase()) {
      case 'CRITICAL':
        color = MaritimeTheme.error;
        icon = Icons.priority_high;
        break;
      case 'HIGH':
        color = MaritimeTheme.warning;
        icon = Icons.arrow_upward;
        break;
      case 'NORMAL':
        color = MaritimeTheme.primary;
        icon = Icons.remove;
        break;
      case 'LOW':
        color = MaritimeTheme.textSecondary;
        icon = Icons.arrow_downward;
        break;
      default:
        color = MaritimeTheme.textSecondary;
        icon = Icons.help_outline;
    }

    return Container(
      constraints: const BoxConstraints(maxWidth: 100), // Prevent overflow on small screens
      padding: EdgeInsets.symmetric(
        horizontal: small ? 6 : 8,
        vertical: small ? 2 : 4,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: small ? 12 : 14, color: color),
          SizedBox(width: small ? 2 : 4),
          Flexible(
            child: Text(
              priority.toUpperCase(),
              style: TextStyle(
                fontSize: small ? 10 : 11,
                fontWeight: FontWeight.bold,
                color: color,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
