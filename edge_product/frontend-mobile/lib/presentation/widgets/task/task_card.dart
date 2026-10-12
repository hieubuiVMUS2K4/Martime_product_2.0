import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import '../../../data/models/maintenance_task.dart';
import 'priority_badge.dart';
import 'status_badge.dart';

class TaskCard extends StatelessWidget {
  final MaintenanceTask task;
  final VoidCallback onTap;

  const TaskCard({
    super.key,
    required this.task,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isSmallScreen = screenWidth < 400;
    
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: task.isOverdue && !task.isCompleted
            ? BorderSide(color: MaritimeTheme.error, width: 2)
            : BorderSide.none,
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: task.isOverdue && !task.isCompleted
              ? BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: MaritimeTheme.errorSoft,
                )
              : null,
          padding: EdgeInsets.all(isSmallScreen ? 12 : 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: Equipment name + badges
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: Text(
                      task.displayName,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            fontSize: isSmallScreen ? 15 : 16,
                          ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    flex: 1,
                    child: PriorityBadge(priority: task.priority),
                  ),
                ],
              ),
              SizedBox(height: isSmallScreen ? 6 : 8),

              // Task ID
              Text(
                'Task ID: ${task.taskId}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: MaritimeTheme.textSecondary,
                      fontSize: isSmallScreen ? 11 : 12,
                    ),
              ),
              SizedBox(height: isSmallScreen ? 4 : 6),

              // Task description (preview)
              Text(
                task.taskDescription,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontSize: isSmallScreen ? 13 : 14,
                    ),
              ),
              SizedBox(height: isSmallScreen ? 10 : 12),

              // Footer: Status + Due date - Fixed responsive
              Row(
                children: [
                  Flexible(
                    flex: 1,
                    child: StatusBadge(task: task),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    flex: 1,
                    child: _buildDueDate(context, isSmallScreen),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDueDate(BuildContext context, bool isSmallScreen) {
    final daysUntilDue = task.daysUntilDue;
    final isOverdue = task.isOverdue;
    final isDueSoon = task.isDueSoon;

    Color color;
    IconData icon;
    String text;

    if (isOverdue) {
      color = MaritimeTheme.error;
      icon = Icons.warning;
      text = isSmallScreen 
          ? '${daysUntilDue.abs()}d late'
          : '${daysUntilDue.abs()} days overdue';
    } else if (isDueSoon) {
      color = MaritimeTheme.warning;
      icon = Icons.schedule;
      text = isSmallScreen 
          ? '${daysUntilDue}d left'
          : '$daysUntilDue days left';
    } else {
      color = MaritimeTheme.textSecondary;
      icon = Icons.calendar_today;
      text = isSmallScreen 
          ? '${daysUntilDue}d'
          : '$daysUntilDue days';
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: isSmallScreen ? 14 : 16, color: color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            text,
            style: TextStyle(
              fontSize: isSmallScreen ? 11 : 12,
              color: color,
              fontWeight: isOverdue || isDueSoon ? FontWeight.bold : FontWeight.normal,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
