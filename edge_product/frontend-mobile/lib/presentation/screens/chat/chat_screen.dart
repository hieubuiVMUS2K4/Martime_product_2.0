import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import '../../../data/models/chat_message.dart';
import '../../../l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatProvider>().fetchSuggestions();
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _sendMessage(String text) {
    if (text.trim().isEmpty) return;
    _messageController.clear();
    context.read<ChatProvider>().sendMessage(text);
    _scrollToBottom();
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 300), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final chatProvider = context.watch<ChatProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.aiAssistant),
        actions: [
          if (chatProvider.messages.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: l10n.clearChat,
              onPressed: () {
                chatProvider.clearMessages();
              },
            ),
        ],
      ),
      body: Column(
        children: [
          // Chat messages
          Expanded(
            child: chatProvider.messages.isEmpty
                ? _buildWelcomeView(chatProvider, l10n)
                : _buildMessageList(chatProvider),
          ),
          // Input area
          _buildInputArea(l10n, chatProvider.isLoading),
        ],
      ),
    );
  }

  Widget _buildWelcomeView(ChatProvider chatProvider, AppLocalizations l10n) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 32),
          // AI icon
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.smart_toy,
              size: 40,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            l10n.chatWelcomeTitle,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            l10n.chatWelcomeSubtitle,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: MaritimeTheme.textSecondary,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          // Suggested questions
          if (chatProvider.suggestions.isNotEmpty) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                l10n.suggestedQuestions,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ),
            const SizedBox(height: 12),
            ...chatProvider.suggestions.map((suggestion) =>
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _buildSuggestionChip(suggestion),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSuggestionChip(SuggestedQuestion suggestion) {
    final categoryColor = _getCategoryColor(suggestion.category);
    return InkWell(
      onTap: () => _sendMessage(suggestion.question),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(color: categoryColor.withAlpha(80)),
          borderRadius: BorderRadius.circular(12),
          color: categoryColor.withAlpha(15),
        ),
        child: Row(
          children: [
            Icon(
              _getCategoryIcon(suggestion.category),
              size: 20,
              color: categoryColor,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    suggestion.question,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  Text(
                    suggestion.category,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: categoryColor,
                          fontWeight: FontWeight.w500,
                        ),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios, size: 14, color: MaritimeTheme.textTertiary),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageList(ChatProvider chatProvider) {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: chatProvider.messages.length + (chatProvider.isLoading ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == chatProvider.messages.length && chatProvider.isLoading) {
          return _buildTypingIndicator();
        }
        return _buildMessageBubble(chatProvider.messages[index]);
      },
    );
  }

  Widget _buildMessageBubble(ChatMessage message) {
    final isUser = message.isUser;
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              radius: 16,
              backgroundColor: colorScheme.primaryContainer,
              child: Icon(
                Icons.smart_toy,
                size: 18,
                color: colorScheme.primary,
              ),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isUser
                    ? colorScheme.primary
                    : colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isUser ? 16 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 16),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(
                    message.text,
                    style: TextStyle(
                      color: isUser
                          ? colorScheme.onPrimary
                          : colorScheme.onSurface,
                      fontSize: 14,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _formatTime(message.timestamp),
                        style: TextStyle(
                          color: isUser
                              ? colorScheme.onPrimary.withAlpha(180)
                              : MaritimeTheme.textTertiary,
                          fontSize: 11,
                        ),
                      ),
                      if (!isUser && message.source != null) ...[
                        const SizedBox(width: 6),
                        _buildSourceBadge(message.source!),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (isUser) const SizedBox(width: 8),
        ],
      ),
    );
  }

  Widget _buildSourceBadge(String source) {
    final label = switch (source) {
      'gemini' => 'AI',
      'knowledge_base' => 'Offline',
      'fallback' => 'Offline',
      _ => '',
    };
    if (label.isEmpty) return const SizedBox.shrink();

    final color = source == 'gemini' ? MaritimeTheme.accent : MaritimeTheme.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500),
      ),
    );
  }

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            child: Icon(
              Icons.smart_toy,
              size: 18,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomRight: Radius.circular(16),
                bottomLeft: Radius.circular(4),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildDot(0),
                const SizedBox(width: 4),
                _buildDot(1),
                const SizedBox(width: 4),
                _buildDot(2),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDot(int index) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 600 + (index * 200)),
      builder: (context, value, child) {
        return Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: MaritimeTheme.textTertiary?.withAlpha((150 + (105 * value)).toInt()),
            shape: BoxShape.circle,
          ),
        );
      },
    );
  }

  Widget _buildInputArea(AppLocalizations l10n, bool isLoading) {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 8,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(20),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _messageController,
              focusNode: _focusNode,
              enabled: !isLoading,
              textInputAction: TextInputAction.send,
              maxLines: 4,
              minLines: 1,
              decoration: InputDecoration(
                hintText: l10n.typeMessage,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
              ),
              onSubmitted: (text) {
                _sendMessage(text);
              },
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: isLoading
                ? MaritimeTheme.textTertiary
                : Theme.of(context).colorScheme.primary,
            borderRadius: BorderRadius.circular(24),
            child: InkWell(
              borderRadius: BorderRadius.circular(24),
              onTap: isLoading
                  ? null
                  : () => _sendMessage(_messageController.text),
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Icon(
                  Icons.send,
                  color: Theme.of(context).colorScheme.onPrimary,
                  size: 22,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }

  Color _getCategoryColor(String category) {
    return switch (category) {
      'Safety' => MaritimeTheme.error,
      'Navigation' => MaritimeTheme.accent,
      'Environmental' => MaritimeTheme.success,
      'Crew' => MaritimeTheme.warning,
      'Maintenance' => Colors.purple,
      _ => MaritimeTheme.textTertiary,
    };
  }

  IconData _getCategoryIcon(String category) {
    return switch (category) {
      'Safety' => Icons.health_and_safety,
      'Navigation' => Icons.navigation,
      'Environmental' => Icons.eco,
      'Crew' => Icons.people,
      'Maintenance' => Icons.build,
      _ => Icons.help_outline,
    };
  }
}
