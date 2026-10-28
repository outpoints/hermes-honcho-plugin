/**
 * Honcho memory for Hermes Desktop.
 *
 * Plain ESM only. Hermes maps the SDK and React specifiers at runtime, so this
 * file uses jsx()/jsxs() and needs no frontend build step.
 */

import {
  atom,
  Button,
  cn,
  Codicon,
  CopyButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DisclosureCaret,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  host,
  icons,
  MessageTextContent,
  PanelEmpty,
  PANES_AREA,
  PALETTE_AREA,
  queryClient,
  ROUTES_AREA,
  SearchField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SIDEBAR_NAV_AREA,
  Skeleton,
  StatusDot,
  STATUSBAR_AREAS,
  Textarea,
  Tip,
  useMutation,
  useQuery,
  useQueryClient,
  useValue
} from '@hermes/plugin-sdk'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

// ── Localisation ─────────────────────────────────────────────────────────────
// The app owns the language (`display.language`); this plugin only carries its
// own copy. A key names the English sentence it replaces, so a bundle reads as a
// list of what it changes, and a key missing from the active locale falls back to
// the `en` bundle — which is why both are registered.
const COPY = {
  en: {
    a_honcho_scope: "A Honcho scope",
    about: "About",
    across_sessions: "across sessions",
    add_correction: "Add correction",
    add_fact: "Add fact",
    add_to_session: "Add to session",
    add_to_this_honcho_session: "Add to this Honcho session",
    added_but_not_verified: "Added but not verified",
    adding: "Adding…",
    adds_one_explicit_conclusion_earlier_conclusions_stay_as_the: "Adds one explicit conclusion. Earlier conclusions stay as they are, and derived memory may take a while to catch up.",
    after_the_first_message: " after the first message.",
    all_conclusions: "All conclusions",
    all_profiles: "all profiles",
    all_sessions: "All sessions",
    answer: "Answer",
    ask: "Ask",
    ask_memory: "Ask memory",
    asking: "Asking…",
    asks_up_to_in_profile: tokens => `Hermes asks for up to ${tokens} in this profile.`,
    attributed_to: "Attributed to",
    background_reasoning: "Background reasoning",
    blocked: "Blocked",
    can_t_reach_the_honcho_plugin: "Can’t reach the Honcho plugin",
    can_t_tell_who_owns_this_chat: "Can’t tell who owns this chat",
    caught_up: "Caught up",
    check_the_honcho_server_for_this_profile: "Check the Honcho server for this profile.",
    checking: "Checking",
    checking_what_this_honcho_server_supports: "Checking what this Honcho server supports…",
    choose_a_file: "Choose a file",
    choose_a_scope: "Choose a scope",
    choose_a_supported_file_first: "Choose a supported file first.",
    choose_another_file: "Choose another file",
    close: "Close",
    close_and_reopen_this_dialog_to_confirm_the_new_target: "Close and reopen this dialog to confirm the new target.",
    close_conclusion: "Close conclusion",
    conclusion: "Conclusion",
    conclusion_not_found: "Conclusion not found",
    conclusions: "Conclusions",
    conclusions_from_all_sessions: "Conclusions from all sessions",
    conclusions_from_this_session: "Conclusions from this session",
    connected: "Connected",
    connected_to: target => `Connected to ${target}`,
    context: "Context",
    context_layers: "Context layers",
    continued_from_an_earlier_part_of_this_turn: "Continued from an earlier part of this turn",
    copied_total: "Copied total",
    copy_answer: "Copy answer",
    copy_context: "Copy context",
    copy_text: "Copy text",
    correct_this_conclusion: "Correct this conclusion",
    correction_saved_and_verified: "Correction saved and verified",
    correction_verified_body: id => `Honcho returned the exact text as conclusion ${id}. Earlier conclusions were kept.`,
    corrective_fact: "Corrective fact",
    couldn_t_load_this: "Couldn’t load this",
    count_dot_token_total_not_reported: count => `${count} · token total not reported`,
    count_dot_tokens: (count, tokens) => `${count} · ${tokens}`,
    created: "Created",
    current_conclusion: "Current conclusion",
    custom_instructions: "Custom instructions",
    custom_instructions_by_agent: "Custom instructions by agent",
    derived: "Derived",
    derived_from_this: "Derived from this",
    empty_message: "Empty message",
    endpoint_latency: (endpoint, ms) => `${endpoint} answered in ${ms} ms. Checked every 10 seconds.`,
    every_honcho_read_answered: "Every Honcho read answered.",
    fold_message: "Fold message",
    folder: "Folder",
    hermes_can_t_tell_which_profile_owns_this_chat_so_honcho_rea: "Hermes can’t tell which profile owns this chat, so Honcho reads are paused.",
    hermes_chat: "Hermes chat",
    hermes_creates_it_when_it_first_saves_memory_this_view_only_: "Hermes creates it when it first saves memory. This view only reads, so it never creates one.",
    hermes_saves_it_as: "Hermes saves it as ",
    hermes_state: "Hermes state",
    high_effort: "High effort",
    honcho_accepts_pdf_json_and_text_files_choose_another_file: "Honcho accepts PDF, JSON, and text files. Choose another file.",
    honcho_accepts_pdf_json_and_text_files_images_and_other_bina: "Honcho accepts PDF, JSON, and text files. Images and other binary files aren’t supported.",
    honcho_couldn_t_answer_nothing_was_retried: "Honcho couldn’t answer. Nothing was retried.",
    honcho_couldn_t_prepare_the_correction: "Honcho couldn’t prepare the correction.",
    honcho_couldn_t_prepare_this_upload: "Honcho couldn’t prepare this upload.",
    honcho_didn_t_confirm_the_correction_check_memory_before_add: "Honcho didn’t confirm the correction. Check Memory before adding it again.",
    honcho_didn_t_confirm_the_upload: "Honcho didn’t confirm the upload.",
    honcho_didn_t_report_any_records: "Honcho didn't report any records.",
    honcho_didn_t_return_a_summary: "Honcho didn’t return a summary.",
    honcho_dot_n_processing: n => `Honcho · ${n} processing`,
    honcho_dot_n_waiting: n => `Honcho · ${n} waiting`,
    honcho_draws_conclusions_in_the_background_after_messages_ar: "Honcho draws conclusions in the background after messages are saved. Other sessions may already have some.",
    honcho_hasn_t_drawn_conclusions_about_this_user_yet: "Honcho hasn’t drawn conclusions about this user yet.",
    honcho_is_turned_off_for_this_profile: "Honcho is turned off for this profile",
    honcho_isn_t_responding: "Honcho isn’t responding",
    honcho_isn_t_set_up_for_this_profile: "Honcho isn’t set up for this profile",
    honcho_lists_the_messages_it_read_by_reference_without_their: "Honcho lists the messages it read by reference, without their text.",
    honcho_memory: "Honcho memory",
    honcho_memory_is_unavailable: "Honcho memory is unavailable",
    honcho_memory_sections: "Honcho memory sections",
    honcho_ready: "Honcho · ready",
    honcho_returned_an_empty_answer: "Honcho returned an empty answer.",
    honcho_saves_the_text_or_file_as_one_or_more_messages_in_the: "Honcho saves the text or file as one or more messages in the session below, then reasons over it in the background. Nothing is sent until you choose Add to session.",
    honcho_scope: "Honcho scope",
    honcho_session: "Honcho session",
    id: "ID",
    in_this_session: "in this session",
    inspect_search_question_and_correct_the_honcho_memory_behind: "Inspect, search, question, and correct the Honcho memory behind the focused chat.",
    instructions_follow_for: where => `Answers ${where} follow custom instructions.`,
    instructions_off_for: where => `Custom instructions are off for answers ${where}.`,
    it_may_have_been_removed_or_it_belongs_to_another_relationsh: "It may have been removed, or it belongs to another relationship.",
    kind: "Kind",
    larger_than_honcho_s_default_limit: "Larger than Honcho’s default limit",
    last_message: "Last message",
    loading: "Loading",
    low_effort: "Low effort",
    mapped_by: "Mapped by",
    medium_effort: "Medium effort",
    memory: "Memory",
    memory_scope: "Memory scope",
    messages: "Messages",
    messages_appear_here_after_hermes_saves_them_to_honcho: "Messages appear here after Hermes saves them to Honcho.",
    metadata: "Metadata",
    minimal_effort: "Minimal effort",
    n_of_m_done: (done, total) => `${done} of ${total} done`,
    n_processing: n => `${n} processing`,
    n_waiting: n => `${n} waiting`,
    new_draft: "New draft",
    new_synthesis: scope => `New synthesis · ${scope}`,
    next: "Next",
    no_answer: "No answer",
    no_conclusions_yet: "No conclusions yet",
    no_honcho_session_for_this_chat: "No Honcho session for this chat",
    no_limit_uses_default: tokens => `Hermes sets no limit in this profile, so it gets Honcho’s server default. ${tokens} tokens is the largest preview.`,
    no_matching_conclusions: "No matching conclusions",
    no_matching_messages: "No matching messages",
    no_peer_card_yet: "No peer card yet.",
    no_problems_found: "No problems found",
    no_saved_messages_yet: "No saved messages yet",
    no_saved_session_to_add_to: "No saved session to add to",
    no_summary_yet_honcho_writes_one_after_enough_messages: "No summary yet. Honcho writes one after enough messages.",
    no_workspace: "No workspace",
    none_set: "None set",
    none_set_honcho_uses_its_built_in_prompts: "None set. Honcho uses its built-in prompts.",
    not_added: "Not added",
    not_available_on_this_honcho_server_or_sdk: "Not available on this Honcho server or SDK.",
    not_checked: "Not checked",
    not_saved: "Not saved",
    not_saved_yet: "Not saved yet",
    not_set: "Not set",
    not_set_up: "Not set up",
    not_yet: "Not yet",
    nothing_yet: "Nothing yet.",
    observer: "Observer",
    open_a_saved_chat_or_send_a_message_here_memory_appears_once: "Open a saved chat or send a message here. Memory appears once Hermes saves the conversation.",
    open_honcho_memory_for_details: "Open Honcho memory for details",
    open_status_for_details: "Open Status for details.",
    open_the_full_context: "Open the full context",
    other_connection: "Other connection",
    other_session: "Other session",
    outcome_unknown: "Outcome unknown",
    owner_unknown: "Owner unknown",
    page_of_n: (page, pages) => `Page ${page} of ${pages}`,
    partial: "Partial",
    paste_notes_source_material_or_other_context: "Paste notes, source material, or other context.",
    paste_text: "Paste text",
    pdf_json_or_text_files_honcho_s_default_limit_is_5_mib_your_: "PDF, JSON, or text files. Honcho's default limit is 5 MiB; your server may use another.",
    peer_card: "Peer card",
    peers: "Peers",
    previous: "Previous",
    problems: "Problems",
    profile: "Profile",
    question_for_memory: "Question for memory",
    question_scope: "Question scope",
    read_back_source: target => `Each message was read back from ${target}.`,
    read_through: "Read through",
    reading_a_record_doesn_t_mean_it_supports_the_answer: "Reading a record doesn't mean it supports the answer.",
    reads_paused: "Reads paused",
    reasoning_effort: "Reasoning effort",
    rebuild: "Rebuild",
    rebuilding: "Rebuilding…",
    rebuilt_just_now: "Rebuilt from Honcho just now. This is what Honcho would supply today, not a record of what an earlier reply received.",
    recall_mode: "Recall mode",
    recent_message: "recent message",
    recent_messages: "Recent messages",
    records_honcho_read: "Records Honcho read",
    refresh: "Refresh",
    representation: "Representation",
    results_for: query => `Results for “${query}”`,
    routed_via_active: via => `${via} (active profile)`,
    run: "Run ",
    runs_a_new_reasoning_call_on_your_honcho_server_which_may_us: "Runs a new reasoning call on your Honcho server, which may use credits. Nothing runs until you ask. ⌘/Ctrl + Enter also asks.",
    save_correction: "Save correction",
    save_messages: "Save messages",
    saved_in_honcho: "Saved in Honcho",
    saved_in_this_session: "Saved in this session",
    sdk: "SDK",
    search_memory: "Search memory",
    search_memory_and_press_enter: "Search memory and press Enter",
    search_messages: "Search messages",
    search_messages_and_press_enter: "Search messages and press Enter",
    search_scope: "Search scope",
    section_label: label => `Section: ${label}`,
    select_a_conclusion_to_see_where_it_came_from_or_correct_it: "Select a conclusion to see where it came from or correct it.",
    selected_conclusion: "Selected conclusion",
    server_default_limit: limit => `Honcho’s default server limit is ${limit}. Self-hosted servers may set another limit, and your server makes the final call.`,
    server_reported_token: "server-reported token",
    session: "Session",
    session_settings_win_over_workspace_settings_instructions_at: "Session settings win over workspace settings. Instructions attached to a single message win over both and aren’t shown here. Peer card instructions are added to the dream instructions.",
    session_summary: "Session summary",
    session_summary_and_peer_card: "Session summary and peer card",
    shared: "Shared",
    shortened_for_display: "Shortened for display.",
    show_all: "Show all",
    show_all_sessions: "Show all sessions",
    show_full_message: "Show full message",
    show_saved_messages: "Show saved messages",
    show_the_messages_honcho_would_include: "Show the messages Honcho would include",
    some_links_were_left_out: "Some links were left out. ",
    some_records_were_left_out: "Some records were left out.",
    state_the_correct_fact_plainly_including_what_changed: "State the correct fact plainly, including what changed.",
    status: "Status",
    summary: "Summary",
    summary_needs_budget: floor => `Honcho has a summary, but it doesn’t fit this budget. A summary can use at most 40% of what’s left after the representation and peer card, so this one needs more than ${floor} tokens.`,
    text_to_add_to_the_current_honcho_session: "Text to add to the current Honcho session",
    the_answer_was_shortened_for_display: "The answer was shortened for display.",
    the_chat_changed: "The chat changed",
    the_chat_changed_while_honcho_processed_the_upload_the_origi: "The chat changed while Honcho processed the upload. The original session may have new messages. Check its Messages before trying again.",
    the_focused_chat_changed_before_upload_nothing_was_sent: "The focused chat changed before upload. Nothing was sent.",
    the_focused_chat_changed_refresh_and_confirm_the_new_target: "The focused chat changed. Refresh and confirm the new target.",
    the_focused_chat_changed_reopen_add_to_session_and_confirm_t: "The focused chat changed. Reopen Add to session and confirm the new target.",
    the_honcho_plugin_backend_is_not_registered: "The Honcho plugin backend is not registered.",
    the_honcho_target_changed_after_you_confirmed_it_nothing_was: "The Honcho target changed after you confirmed it. Nothing was sent. Refresh and confirm the new target.",
    the_memory_target_changed_nothing_was_sent_reopen_and_confir: "The memory target changed. Nothing was sent. Reopen and confirm the new target.",
    the_plugin_api_did_not_answer: "The plugin API did not answer.",
    the_remote_profile_route_is_unavailable_or_ambiguous_no_honc: "The remote profile route is unavailable or ambiguous. No Honcho request was sent.",
    the_remote_profile_target_changed_after_confirmation_refresh: "The remote profile target changed after confirmation. Refresh and confirm the new target.",
    the_response_was_lost_so_the_correction_may_or_may_not_be_sa: "The response was lost, so the correction may or may not be saved. Check Memory before adding it again.",
    the_upload_response_was_lost_check_this_session_s_messages_b: "The upload response was lost. Check this session’s Messages before trying again. Closing this dialog doesn’t cancel server processing.",
    then_refresh: ", then refresh.",
    this_chat: "This chat",
    this_chat_is_on_another_connection: "This chat is on another connection",
    this_chat_isn_t_in_honcho_yet: "This chat isn’t in Honcho yet",
    this_chat_runs_on_another_hermes_connection_switch_hermes_to: "This chat runs on another Hermes connection. Switch Hermes to that connection to read its memory.",
    this_honcho_sdk_can_t_load_premises_or_derived_conclusions: "This Honcho SDK can't load premises or derived conclusions.",
    this_honcho_server_doesn_t_expose_these_links: "This Honcho server doesn't expose these links.",
    this_honcho_server_doesn_t_report_which_records_it_read: "This Honcho server doesn't report which records it read.",
    this_honcho_workspace_doesn_t_exist_yet: "This Honcho workspace doesn’t exist yet",
    this_needs_a_chat_that_hermes_has_already_saved_to_honcho_in: "This needs a chat that Hermes has already saved to Honcho in this profile.",
    this_session: " (this session)",
    this_user_all_sessions: "This user, all sessions",
    token: "token",
    token_budget: "Token budget",
    totals_only: "Totals only.",
    try_again: "Try again",
    try_n_tokens: n => `Try ${n} tokens`,
    try_other_words_or_a_wider_scope_results_keep_honcho_s_relev: "Try other words or a wider scope. Results keep Honcho’s relevance order.",
    try_other_words_or_search_all_sessions: "Try other words or search all sessions.",
    turn_it_on_with: "Turn it on with ",
    turned_off: "Turned off",
    unavailable: "Unavailable",
    unknown_time: "Unknown time",
    unreachable: "Unreachable",
    unsupported_file_type: "Unsupported file type",
    update_hermes_desktop_to_enable_remote_profile_routing: "Update Hermes Desktop to enable remote profile routing.",
    uses_the_shared_text: "Uses the shared text",
    view_status: "View status",
    waiting_for_a_reply: "Waiting for a reply",
    what_honcho_knows_across_sessions: "What Honcho knows across sessions",
    what_honcho_knows_in_this_session: "What Honcho knows in this session",
    what_should_guide_this_work_ask_about_preferences_decisions_: "What should guide this work? Ask about preferences, decisions, or facts.",
    where_this_memory_lives: "Where this memory lives",
    whole_workspace: "Whole workspace",
    workspace: "Workspace",
    workspace_memory: "Workspace memory",
    write_frequency: "Write frequency",
    x_confidence: level => `${level} confidence`,
  },
  zh: {
    a_honcho_scope: "指定 Honcho 范围",
    about: "关于",
    across_sessions: "跨会话",
    add_correction: "添加纠正",
    add_fact: "添加事实",
    add_to_session: "添加到会话",
    add_to_this_honcho_session: "添加到这个 Honcho 会话",
    added_but_not_verified: "已添加但未核对",
    adding: "添加中…",
    adds_one_explicit_conclusion_earlier_conclusions_stay_as_the: "只新增一条明确的结论。之前的结论保持原样，推导出的记忆可能要过一会儿才跟上。",
    after_the_first_message: "，在第一条消息之后。",
    all_conclusions: "所有结论",
    all_profiles: "所有配置档",
    all_sessions: "所有会话",
    answer: "回答",
    ask: "提问",
    ask_memory: "向记忆提问",
    asking: "提问中…",
    asks_up_to_in_profile: tokens => `Hermes 在这个配置档里最多请求 ${tokens}。`,
    attributed_to: "归属到",
    background_reasoning: "后台推理",
    blocked: "被阻断",
    can_t_reach_the_honcho_plugin: "连不上 Honcho 插件",
    can_t_tell_who_owns_this_chat: "认不出这个对话的归属",
    caught_up: "已处理完",
    check_the_honcho_server_for_this_profile: "去查一下这个配置档对应的 Honcho 服务器。",
    checking: "检查中",
    checking_what_this_honcho_server_supports: "正在检查这个 Honcho 服务器支持什么…",
    choose_a_file: "选择文件",
    choose_a_scope: "选择范围",
    choose_a_supported_file_first: "先选一个支持的文件。",
    choose_another_file: "换一个文件",
    close: "关闭",
    close_and_reopen_this_dialog_to_confirm_the_new_target: "关闭后重新打开这个对话框，以确认新的目标。",
    close_conclusion: "关闭结论",
    conclusion: "结论",
    conclusion_not_found: "找不到这条结论",
    conclusions: "结论",
    conclusions_from_all_sessions: "所有会话的结论",
    conclusions_from_this_session: "本会话的结论",
    connected: "已连接",
    connected_to: target => `已连接到 ${target}`,
    context: "上下文",
    context_layers: "上下文分层",
    continued_from_an_earlier_part_of_this_turn: "接续本轮更早的一段",
    copied_total: "复制总量",
    copy_answer: "复制回答",
    copy_context: "复制上下文",
    copy_text: "复制文本",
    correct_this_conclusion: "纠正这条结论",
    correction_saved_and_verified: "纠正已保存并核对",
    correction_verified_body: id => `Honcho 把这段原文原样返回，结论 ID 是 ${id}。之前的结论都保留了。`,
    corrective_fact: "纠正事实",
    couldn_t_load_this: "加载失败",
    count_dot_token_total_not_reported: count => `${count} · 未报告 token 总数`,
    count_dot_tokens: (count, tokens) => `${count} · ${tokens}`,
    created: "创建时间",
    current_conclusion: "当前结论",
    custom_instructions: "自定义指令",
    custom_instructions_by_agent: "各 Agent 的自定义指令",
    derived: "推导",
    derived_from_this: "由此推导",
    empty_message: "空消息",
    endpoint_latency: (endpoint, ms) => `${endpoint} 在 ${ms} 毫秒内响应。每 10 秒检查一次。`,
    every_honcho_read_answered: "每次 Honcho 读取都正常返回。",
    fold_message: "折叠消息",
    folder: "文件夹",
    hermes_can_t_tell_which_profile_owns_this_chat_so_honcho_rea: "Hermes 认不出这个对话属于哪个配置档，所以 Honcho 读取已暂停。",
    hermes_chat: "Hermes 对话",
    hermes_creates_it_when_it_first_saves_memory_this_view_only_: "Hermes 第一次保存记忆时会自动创建。这个视图只读，所以它不会去建。",
    hermes_saves_it_as: "Hermes 会把它存为 ",
    hermes_state: "Hermes 状态",
    high_effort: "高强度",
    honcho_accepts_pdf_json_and_text_files_choose_another_file: "Honcho 接受 PDF、JSON 和文本文件。请换一个文件。",
    honcho_accepts_pdf_json_and_text_files_images_and_other_bina: "Honcho 只接受 PDF、JSON 和文本文件。图片和其他二进制文件不支持。",
    honcho_couldn_t_answer_nothing_was_retried: "Honcho 没能回答，也没有重试。",
    honcho_couldn_t_prepare_the_correction: "Honcho 没能准备好这次纠正。",
    honcho_couldn_t_prepare_this_upload: "Honcho 没能准备好这次上传。",
    honcho_didn_t_confirm_the_correction_check_memory_before_add: "Honcho 没有确认这次纠正。再添加之前先去「记忆」里核对。",
    honcho_didn_t_confirm_the_upload: "Honcho 没有确认这次上传。",
    honcho_didn_t_report_any_records: "Honcho 没有报告任何记录。",
    honcho_didn_t_return_a_summary: "Honcho 没有返回摘要。",
    honcho_dot_n_processing: n => `Honcho · ${n} 处理中`,
    honcho_dot_n_waiting: n => `Honcho · ${n} 等待中`,
    honcho_draws_conclusions_in_the_background_after_messages_ar: "消息保存后 Honcho 会在后台归纳结论。其他会话可能已经有了。",
    honcho_hasn_t_drawn_conclusions_about_this_user_yet: "Honcho 还没对这个用户归纳出结论。",
    honcho_is_turned_off_for_this_profile: "这个配置档已关闭 Honcho",
    honcho_isn_t_responding: "Honcho 没有响应",
    honcho_isn_t_set_up_for_this_profile: "这个配置档还没配置 Honcho",
    honcho_lists_the_messages_it_read_by_reference_without_their: "Honcho 只按引用列出它读过的消息，不带正文。",
    honcho_memory: "Honcho 记忆",
    honcho_memory_is_unavailable: "Honcho 记忆不可用",
    honcho_memory_sections: "Honcho 记忆分区",
    honcho_ready: "Honcho · 就绪",
    honcho_returned_an_empty_answer: "Honcho 返回了一个空回答。",
    honcho_saves_the_text_or_file_as_one_or_more_messages_in_the: "Honcho 会把这段文本或文件存成下面这个会话里的若干条消息，然后在后台对它做推理。你不点「添加到会话」就不会发出去。",
    honcho_scope: "Honcho 范围",
    honcho_session: "Honcho 会话",
    id: "ID",
    in_this_session: "本会话内",
    inspect_search_question_and_correct_the_honcho_memory_behind: "查看、搜索、提问并纠正当前对话背后的 Honcho 记忆。",
    instructions_follow_for: where => `${where}的回答会遵循自定义指令。`,
    instructions_off_for: where => `${where}的回答没有开启自定义指令。`,
    it_may_have_been_removed_or_it_belongs_to_another_relationsh: "它可能已被删除，或者属于另一段关系。",
    kind: "类型",
    larger_than_honcho_s_default_limit: "超过 Honcho 的默认上限",
    last_message: "最后一条消息",
    loading: "加载中",
    low_effort: "低强度",
    mapped_by: "映射方式",
    medium_effort: "中强度",
    memory: "记忆",
    memory_scope: "记忆范围",
    messages: "消息",
    messages_appear_here_after_hermes_saves_them_to_honcho: "Hermes 把消息存进 Honcho 之后，它们会出现在这里。",
    metadata: "元数据",
    minimal_effort: "最低强度",
    n_of_m_done: (done, total) => `${done} / ${total} 完成`,
    n_processing: n => `${n} 处理中`,
    n_waiting: n => `${n} 等待中`,
    new_draft: "新草稿",
    new_synthesis: scope => `新推理 · ${scope}`,
    next: "下一页",
    no_answer: "没有回答",
    no_conclusions_yet: "还没有结论",
    no_honcho_session_for_this_chat: "这个对话还没有 Honcho 会话",
    no_limit_uses_default: tokens => `Hermes 在这个配置档没设上限，所以按 Honcho 服务端的默认值。预览最大到 ${tokens} tokens。`,
    no_matching_conclusions: "没有匹配的结论",
    no_matching_messages: "没有匹配的消息",
    no_peer_card_yet: "还没有画像卡。",
    no_problems_found: "没有发现问题",
    no_saved_messages_yet: "还没有保存的消息",
    no_saved_session_to_add_to: "没有可添加的已保存会话",
    no_summary_yet_honcho_writes_one_after_enough_messages: "还没有摘要。消息够多之后 Honcho 会写一份。",
    no_workspace: "无工作区",
    none_set: "没有设置",
    none_set_honcho_uses_its_built_in_prompts: "没有设置。Honcho 使用内置提示词。",
    not_added: "未添加",
    not_available_on_this_honcho_server_or_sdk: "这个 Honcho 服务器或 SDK 不支持。",
    not_checked: "未检查",
    not_saved: "未保存",
    not_saved_yet: "尚未保存",
    not_set: "未设置",
    not_set_up: "未配置",
    not_yet: "还没有",
    nothing_yet: "还什么都没有。",
    observer: "观察方",
    open_a_saved_chat_or_send_a_message_here_memory_appears_once: "打开一个已保存的对话，或在这里发一条消息。Hermes 保存对话后记忆才会出现。",
    open_honcho_memory_for_details: "打开 Honcho 记忆查看详情",
    open_status_for_details: "打开「状态」看详情。",
    open_the_full_context: "打开完整上下文",
    other_connection: "其他连接",
    other_session: "其他会话",
    outcome_unknown: "结果未知",
    owner_unknown: "归属未知",
    page_of_n: (page, pages) => `第 ${page} 页，共 ${pages} 页`,
    partial: "部分可用",
    paste_notes_source_material_or_other_context: "粘贴笔记、素材或其他上下文。",
    paste_text: "粘贴文本",
    pdf_json_or_text_files_honcho_s_default_limit_is_5_mib_your_: "PDF、JSON 或文本文件。Honcho 默认上限 5 MiB，你的服务器可能设了别的。",
    peer_card: "画像卡",
    peers: "参与者",
    previous: "上一页",
    problems: "问题",
    profile: "配置档",
    question_for_memory: "向记忆提问",
    question_scope: "提问范围",
    read_back_source: target => `每条消息都已从 ${target} 读回核对。`,
    read_through: "读取截至",
    reading_a_record_doesn_t_mean_it_supports_the_answer: "读到某条记录，不代表它就是答案的依据。",
    reads_paused: "读取已暂停",
    reasoning_effort: "推理强度",
    rebuild: "重建",
    rebuilding: "重建中…",
    rebuilt_just_now: "刚从 Honcho 重建。这是它今天会提供的内容，不是某次早前回复实际收到的记录。",
    recall_mode: "召回模式",
    recent_message: "条最近消息",
    recent_messages: "最近的消息",
    records_honcho_read: "Honcho 读过的记录",
    refresh: "刷新",
    representation: "表征",
    results_for: query => `“${query}”的结果`,
    routed_via_active: via => `${via}（当前配置档）`,
    run: "运行 ",
    runs_a_new_reasoning_call_on_your_honcho_server_which_may_us: "在你的 Honcho 服务器上跑一次新的推理，可能消耗额度。你不点就不会跑。⌘/Ctrl + Enter 也能提问。",
    save_correction: "保存纠正",
    save_messages: "保存消息",
    saved_in_honcho: "已存进 Honcho",
    saved_in_this_session: "已保存在本会话",
    sdk: "SDK",
    search_memory: "搜索记忆",
    search_memory_and_press_enter: "搜索记忆，回车执行",
    search_messages: "搜索消息",
    search_messages_and_press_enter: "搜索消息，回车执行",
    search_scope: "搜索范围",
    section_label: label => `分区：${label}`,
    select_a_conclusion_to_see_where_it_came_from_or_correct_it: "选一条结论，看看它从哪来，或者纠正它。",
    selected_conclusion: "选中的结论",
    server_default_limit: limit => `Honcho 服务端默认上限是 ${limit}。自建服务器可以设别的上限，最终以你的服务器为准。`,
    server_reported_token: "个服务器上报的 token",
    session: "会话",
    session_settings_win_over_workspace_settings_instructions_at: "会话设置优先于工作区设置。挂在单条消息上的指令优先于前两者，这里不显示。画像卡指令会加进 dream 指令里。",
    session_summary: "会话摘要",
    session_summary_and_peer_card: "会话摘要和画像卡",
    shared: "共享",
    shortened_for_display: "为显示已截断。",
    show_all: "展开全部",
    show_all_sessions: "显示所有会话",
    show_full_message: "显示完整消息",
    show_saved_messages: "显示已保存的消息",
    show_the_messages_honcho_would_include: "查看 Honcho 会带上哪些消息",
    some_links_were_left_out: "有部分关联被省略了。",
    some_records_were_left_out: "有部分记录被省略了。",
    state_the_correct_fact_plainly_including_what_changed: "把正确的事实讲清楚，包括改了什么。",
    status: "状态",
    summary: "摘要",
    summary_needs_budget: floor => `Honcho 有一份摘要，但放不进这个预算。摘要最多只能用掉表征和画像卡之后剩余预算的 40%，这份需要超过 ${floor} tokens。`,
    text_to_add_to_the_current_honcho_session: "要加进当前 Honcho 会话的文本",
    the_answer_was_shortened_for_display: "回答为显示已截断。",
    the_chat_changed: "对话已切换",
    the_chat_changed_while_honcho_processed_the_upload_the_origi: "Honcho 处理上传时对话切换了。原来那个会话可能已经有新消息，再试之前先去它的「消息」里核对。",
    the_focused_chat_changed_before_upload_nothing_was_sent: "上传前当前对话变了，什么都没发出去。",
    the_focused_chat_changed_refresh_and_confirm_the_new_target: "当前对话变了。刷新一次，确认新的目标。",
    the_focused_chat_changed_reopen_add_to_session_and_confirm_t: "当前对话变了。重新打开「添加到会话」，确认新的目标。",
    the_honcho_plugin_backend_is_not_registered: "Honcho 插件的后端没有注册。",
    the_honcho_target_changed_after_you_confirmed_it_nothing_was: "你确认之后 Honcho 的目标变了，什么都没发出去。刷新并确认新的目标。",
    the_memory_target_changed_nothing_was_sent_reopen_and_confir: "记忆目标变了，什么都没发出去。重新打开并确认新的目标。",
    the_plugin_api_did_not_answer: "插件 API 没有响应。",
    the_remote_profile_route_is_unavailable_or_ambiguous_no_honc: "远程配置档的路由不可用或有歧义，没有发出任何 Honcho 请求。",
    the_remote_profile_target_changed_after_confirmation_refresh: "确认之后远程配置档的目标变了。刷新一次，确认新的目标。",
    the_response_was_lost_so_the_correction_may_or_may_not_be_sa: "响应丢了，这次纠正可能存上了也可能没存。再添加之前先去「记忆」里核对。",
    the_upload_response_was_lost_check_this_session_s_messages_b: "上传的响应丢了。再试之前先去本会话的「消息」里核对。关掉这个对话框并不会取消服务器上的处理。",
    then_refresh: "，然后刷新。",
    this_chat: "本对话",
    this_chat_is_on_another_connection: "这个对话在另一个连接上",
    this_chat_isn_t_in_honcho_yet: "这个对话还没进 Honcho",
    this_chat_runs_on_another_hermes_connection_switch_hermes_to: "这个对话跑在另一个 Hermes 连接上。把 Hermes 切到那个连接才能读它的记忆。",
    this_honcho_sdk_can_t_load_premises_or_derived_conclusions: "这个 Honcho SDK 加载不了前提和推导出的结论。",
    this_honcho_server_doesn_t_expose_these_links: "这个 Honcho 服务器没有开放这些关联。",
    this_honcho_server_doesn_t_report_which_records_it_read: "这个 Honcho 服务器不上报它读了哪些记录。",
    this_honcho_workspace_doesn_t_exist_yet: "这个 Honcho 工作区还不存在",
    this_needs_a_chat_that_hermes_has_already_saved_to_honcho_in: "这需要一个 Hermes 已经保存到 Honcho 的对话（在本配置档里）。",
    this_session: "（本会话）",
    this_user_all_sessions: "这个用户，所有会话",
    token: "token",
    token_budget: "Token 预算",
    totals_only: "仅显示总量。",
    try_again: "重试",
    try_n_tokens: n => `试试 ${n} tokens`,
    try_other_words_or_a_wider_scope_results_keep_honcho_s_relev: "换个词或者放宽范围。结果按 Honcho 的相关度排序。",
    try_other_words_or_search_all_sessions: "换个词试试，或者搜所有会话。",
    turn_it_on_with: "用 ",
    turned_off: "已关闭",
    unavailable: "不可用",
    unknown_time: "时间未知",
    unreachable: "连不上",
    unsupported_file_type: "不支持的文件类型",
    update_hermes_desktop_to_enable_remote_profile_routing: "升级 Hermes Desktop 才能启用远程配置档路由。",
    uses_the_shared_text: "使用共享文本",
    view_status: "查看状态",
    waiting_for_a_reply: "等待回复",
    what_honcho_knows_across_sessions: "Honcho 跨会话知道什么",
    what_honcho_knows_in_this_session: "Honcho 在本会话里知道什么",
    what_should_guide_this_work_ask_about_preferences_decisions_: "该按什么来做？可以问偏好、决定或事实。",
    where_this_memory_lives: "这条记忆的存放位置",
    whole_workspace: "整个工作区",
    workspace: "工作区",
    workspace_memory: "工作区记忆",
    write_frequency: "写入频率",
    x_confidence: level => `${level}置信度`,
  }
}

// Bound to `ctx.i18n.t` in register(), which resolves the app's locale on every
// call. Until then it reads the English bundle directly, so a render helper that
// runs before registration (or outside the app) shows the sentence, never a key.
let t = (key, ...args) => {
  const entry = COPY.en[key]
  if (typeof entry === 'function') return entry(...args)
  return entry ?? key
}
const PLUGIN_ID = 'hermes-honcho-plugin'
const ROUTE = '/honcho'
const POLL_INTERVAL_MS = 10_000
const PAGE_SIZE = 25
const SEARCH_LIMIT = 20
const HONCHO_DEFAULT_FILE_BYTES = 5_242_880
// Host navigation (a sidebar row, a link) moves chat focus before the route
// changes. Only a route change this soon after the user's action inherits the
// chat that was in view.
const NAVIGATION_WINDOW_MS = 3_000
// Labels are keys: the tab names are translated where they are rendered, not
// here, because this module evaluates before register() binds the translator.
const SECTIONS = [
  { id: 'memory', label: 'memory' },
  { id: 'ask', label: 'ask' },
  { id: 'messages', label: 'messages' },
  { id: 'context', label: 'context' },
  { id: 'status', label: 'status' }
]
const CONTEXT_BUDGETS = [1024, 2048, 4096, 8192, 16384, 32000]
const MAX_CONTEXT_BUDGET = 32000
// Honcho gives the session summary at most this share of the budget left after
// the representation and peer card, and returns no summary when it can't fit.
const SUMMARY_BUDGET_SHARE = 0.4
const $activeTab = atom('memory')
const $selection = atom(null)
const $uploadOrigin = atom(null)
const $inspectionFocus = atom(null)
const LayoutContext = createContext('compact')
// Dense metadata must stay readable in the host's light theme. These aliases
// apply to this plugin's surfaces only and never alter the app theme.
const READABLE_TOKENS = {
  '--dt-muted-foreground': 'var(--ui-text-secondary)',
  '--ui-text-tertiary': 'var(--ui-text-secondary)'
}
// The host's TextTab, spelled with utilities its shipped stylesheet defines.
const TEXT_TAB = 'group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
const BLOCK = 'max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-foreground/5 p-2.5 text-[0.68rem] leading-relaxed text-foreground/80'
const PROSE = { maxWidth: '72ch', overflowWrap: 'anywhere' }
// The app shell disables text selection globally. Memory content opts back in,
// as core chat and first-party plugins do, so it can be selected and copied.
const SELECTABLE = { 'data-selectable-text': 'true' }
// Rows keep their hover padding while their text aligns with the heading.
const BLEED = { marginInline: -10 }
// Dialog geometry the shipped stylesheet has no utilities for.
const DIALOG_STYLE = { ...READABLE_TOKENS, maxHeight: '88vh', overflowY: 'auto', maxWidth: 'min(36rem, calc(100vw - 2rem))' }

let requestPlugin = null
let pendingNavigation = null

// ── Layout ──────────────────────────────────────────────────────────────────

function layoutForWidth(width) {
  if (width < 440) return 'narrow'
  if (width < 880) return 'compact'
  return 'wide'
}

function useContainerLayout() {
  const ref = useRef(null)
  const [layout, setLayout] = useState('compact')

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const update = width => setLayout(current => {
      const next = layoutForWidth(width)
      return current === next ? current : next
    })
    update(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, layout }
}

function ResponsiveSurface({ className, style, children }) {
  const { ref, layout } = useContainerLayout()
  return jsx('div', {
    ref,
    'data-honcho-surface': '',
    'data-layout': layout,
    className,
    style: { ...READABLE_TOKENS, ...style },
    children: jsx(LayoutContext.Provider, { value: layout, children })
  })
}

function useLayout() {
  return useContext(LayoutContext)
}

// ── Formatting ──────────────────────────────────────────────────────────────

function text(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function number(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return new Intl.NumberFormat().format(Number(value))
}

function plural(count, singular, many = `${singular}s`) {
  return `${number(count, '0')} ${Number(count) === 1 ? singular : many}`
}

function formatTime(value, fallback = t('unknown_time')) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

// Presentation only. Never apply this to session, peer, profile or record IDs.
function sentence(value) {
  const source = text(value, '')
  if (!source) return '—'
  const words = source.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function queueLabel(queue) {
  if (!queue) return 'Unavailable'
  if (queue.in_progress > 0) return t('n_processing', number(queue.in_progress))
  if (queue.pending > 0) return t('n_waiting', number(queue.pending))
  return t('caught_up')
}

function queueDetail(queue) {
  return queue ? t('n_of_m_done', number(queue.completed, '0'), number(queue.total, '0')) : null
}

function localState(query) {
  if (query.busy) return query.awaitingResponse ? t('waiting_for_a_reply') : 'Generating'
  return 'Idle'
}

function contextMessageDetail(session) {
  const count = plural(session?.messages?.length || 0, t('recent_message'))
  return session?.token_count === null || session?.token_count === undefined
    ? t('count_dot_token_total_not_reported', count)
    : t('count_dot_tokens', count, plural(session.token_count, t('server_reported_token')))
}

// The stored summary Honcho picks when the budget holds it: the long one when
// it is longer than the short one, otherwise the short one.
function storedSummary(stored) {
  const short = stored?.short?.content ? stored.short : null
  const long = stored?.long?.content ? stored.long : null
  if (long && (!short || (long.token_count ?? 0) > (short.token_count ?? 0))) return long
  return short || long
}

// Smallest budget that could hold a stored summary. A lower bound: the
// representation and peer card come out of the same budget first.
function summaryBudgetFloor(stored) {
  const counts = [stored?.short, stored?.long]
    .map(item => (item?.content ? Number(item.token_count) : NaN))
    .filter(value => Number.isFinite(value) && value > 0)
  return counts.length ? Math.ceil(Math.min(...counts) / SUMMARY_BUDGET_SHARE) : null
}

// Hermes's own context cap, kept inside the preview's range. Without a cap
// Hermes gets Honcho's server default, so the largest preview is closest.
function contextBudgetFor(contextTokens) {
  const value = Number(contextTokens)
  return Number.isInteger(value) && value > 0 ? Math.min(MAX_CONTEXT_BUDGET, Math.max(256, value)) : MAX_CONTEXT_BUDGET
}

// ── Honcho text formats ─────────────────────────────────────────────────────
// Presentation only. The raw strings stay untouched in Copy actions.
// Multi-line markdown (summaries, answers, messages) goes through the host's
// chat renderer (see Markdown). One-line records use this inline subset.

function inlineMarkdown(source) {
  const value = text(source, '')
  const parts = []
  let last = 0
  for (const match of value.matchAll(/\*\*([^*\n]+)\*\*|`([^`\n]+)`/g)) {
    if (match.index > last) parts.push(value.slice(last, match.index))
    parts.push(match[1] !== undefined
      ? jsx('strong', { className: 'font-medium text-foreground', children: match[1] }, match.index)
      : jsx('code', { className: 'font-mono text-foreground', style: { fontSize: '0.92em' }, children: match[2] }, match.index))
    last = match.index + match[0].length
  }
  if (!parts.length) return value
  if (last < value.length) parts.push(value.slice(last))
  return parts
}

// Honcho's Representation.format_as_markdown(): "## Explicit Observations"
// sections of "[YYYY-MM-DD HH:MM:SS] text" entries, with indented premises or
// sources. Older SDKs send "EXPLICIT:" headings and numbered entries.
// Inductive and contradiction entries carry no timestamp; they open with a
// bold label instead: " **Pattern** [high]: text", " **CONTRADICTION**: text".
const OBSERVATION_PREFIX = /^(?:\d{1,4}[.)]\s+)?(?:\[id:[^\]]*\]\s*)?/
const OBSERVATION_STAMP = /^\[((\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?[^\]]*)\]\s*/
const OBSERVATION_LABEL = /^\*\*([A-Za-z][A-Za-z ]{0,30})\*\*\s*(?:\[([A-Za-z]{1,12})\])?\s*:\s*/

function observationLabel(name, confidence) {
  if (confidence) return t('x_confidence', sentence(confidence.toLowerCase()))
  return name.toLowerCase() === 'pattern' ? null : sentence(name.toLowerCase())
}

function parseRepresentation(source) {
  const sections = []
  let section = null
  let entry = null
  const open = title => {
    section = { title, entries: [] }
    sections.push(section)
    entry = null
  }
  for (const line of text(source, '').split('\n')) {
    if (!line.trim()) continue
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/) || line.match(/^([A-Z][A-Z ]{2,40}):\s*$/)
    if (heading) {
      open(heading[1])
      continue
    }
    if (entry && /^\s{2,}\S/.test(line)) {
      entry.details.push(line.trim())
      continue
    }
    if (!section) open(null)
    let body = line.trim().replace(OBSERVATION_PREFIX, '')
    const stamp = body.match(OBSERVATION_STAMP)
    if (stamp) body = body.slice(stamp[0].length)
    const label = stamp ? null : body.match(OBSERVATION_LABEL)
    if (label) body = body.slice(label[0].length)
    entry = {
      stamp: stamp ? stamp[1] : null,
      date: stamp ? stamp[2] : null,
      time: stamp ? stamp[3] : null,
      label: label ? observationLabel(label[1], label[2]) : null,
      text: body,
      details: []
    }
    section.entries.push(entry)
  }
  return sections.filter(item => item.entries.length)
}

// Honcho's structural headings ("Explicit Observations", "EXPLICIT") read in
// the host's sentence case. They are labels, not memory content.
function sectionTitle(title) {
  return title ? sentence(title.toLowerCase()) : null
}

function countObservations(sections) {
  return sections.reduce((total, section) => total + section.entries.length, 0)
}

function formatDay(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  // Honcho strips the time zone from these stamps, so keep the calendar date
  // exactly as written instead of shifting it into the viewer's zone.
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

// Peer cards are "CATEGORY: Key: value" facts, or plain sentences.
function parsePeerCard(facts) {
  const groups = []
  const byCategory = new Map()
  for (const fact of Array.isArray(facts) ? facts : []) {
    const source = text(fact, '').trim()
    if (!source) continue
    const categorized = source.match(/^([A-Z][A-Z0-9_ -]{1,31}):\s+([\s\S]+)$/)
    const category = categorized ? categorized[1] : ''
    const body = categorized ? categorized[2] : source
    const keyed = body.match(/^([^:\n]{1,40}?):\s+([\s\S]+)$/)
    // A key is a short label, not a sentence that happens to contain a colon.
    const key = keyed && keyed[1].trim().split(/\s+/).length <= 4 && !/[.!?]$/.test(keyed[1]) ? keyed[1].trim() : null
    let group = byCategory.get(category)
    if (!group) {
      group = { category, label: category ? sentence(category.toLowerCase()) : null, facts: [] }
      byCategory.set(category, group)
      groups.push(group)
    }
    group.facts.push({ key, value: key ? keyed[2] : body, source })
  }
  return groups
}

// Hermes splits turns over Honcho's message limit and prefixes every later
// chunk with "[continued] " so Honcho can rejoin them.
const CONTINUED_PREFIX = '[continued] '

function messageBody(content) {
  const source = text(content, '')
  return source.startsWith(CONTINUED_PREFIX)
    ? { continued: true, body: source.slice(CONTINUED_PREFIX.length) }
    : { continued: false, body: source }
}

// Message timestamps carry a zone, so they group by the viewer's calendar day.
function localDay(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatClock(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date)
}

function groupByDay(items, dayOf) {
  const days = []
  for (const item of items) {
    const date = dayOf(item)
    const last = days[days.length - 1]
    if (last && last.date === date) last.items.push(item)
    else days.push({ date, items: [item] })
  }
  return days
}

// ── Focus and ownership ─────────────────────────────────────────────────────

function readFocusScope(read = store => store.get()) {
  const activeProfile = read(host.state.profile) || 'default'
  const activeConnection = read(host.state.connectionId) || 'local'
  const focusedOwner = read(host.state.focusedSessionOwner)
  const focusedProfile = read(host.state.focusedSessionProfile)
  const runtimeSessionId = read(host.state.focusedSessionId)
  const storedSessionId = read(host.state.focusedStoredSessionId)
  const cwd = read(host.state.cwd)
  const busy = read(host.state.busy)
  const awaitingResponse = read(host.state.awaitingResponse)
  // The SDK resolves a focused saved chat to exactly one (connection, profile)
  // owner, or null when ownership is ambiguous. Null never means "use the
  // active backend": that could read another profile's memory.
  const ownerUnresolved = Boolean(storedSessionId && !focusedOwner?.connectionId)
  const ownerConnection = focusedOwner?.connectionId || activeConnection
  const ownerProfile = focusedOwner?.profile || focusedProfile || activeProfile
  // A chat from another profile on the same connection is read in its owner's
  // profile (the t('all_profiles') sidebar does this constantly). ctx.rest cannot
  // reach a different connection, so those chats stay blocked.
  const otherConnection = !ownerUnresolved && ownerConnection !== activeConnection
  const routeMismatch = ownerUnresolved || otherConnection
  const focusId = storedSessionId || runtimeSessionId || 'draft'
  const fingerprint = [
    activeProfile,
    activeConnection,
    ownerProfile,
    ownerConnection,
    storedSessionId || '',
    runtimeSessionId || '',
    cwd || ''
  ].join('|')

  return {
    activeProfile,
    connectionId: activeConnection,
    ownerProfile,
    ownerConnection,
    focusedOwner,
    runtimeSessionId,
    storedSessionId,
    cwd,
    busy,
    awaitingResponse,
    routeMismatch,
    blockReason: ownerUnresolved ? 'owner_unresolved' : otherConnection ? 'other_connection' : null,
    fingerprint,
    key: [activeProfile, activeConnection, ownerProfile, ownerConnection, focusId, runtimeSessionId || '', cwd || ''],
    body: {
      profile: ownerProfile,
      focused_profile: ownerProfile,
      connection_id: activeConnection,
      focused_connection_id: ownerConnection,
      runtime_session_id: routeMismatch ? null : runtimeSessionId,
      stored_session_id: routeMismatch ? null : storedSessionId,
      cwd: routeMismatch ? null : cwd
    }
  }
}

function hasSession(scope) {
  return Boolean(scope && !scope.routeMismatch && (scope.storedSessionId || scope.runtimeSessionId))
}

function inspectionScope(raw, inspection = $inspectionFocus.get()) {
  if (!inspection) return raw
  const { focus, baseline } = inspection
  const routeCleared = inspection.navigation && typeof window !== 'undefined' &&
    window.location.hash === `#${ROUTE}` && !raw.storedSessionId && !raw.runtimeSessionId
  // A pane interaction may replace a tile with the host's route-primary (even
  // a different saved chat). Only that interaction's handoff is retained.
  // Never carry the target across routing, workspace, or later session changes.
  if (raw.routeMismatch || raw.activeProfile !== focus.activeProfile ||
      raw.connectionId !== focus.connectionId || raw.cwd !== focus.cwd ||
      (baseline !== null && raw.fingerprint !== baseline && !routeCleared)) return raw
  return focus
}

function useFocusScope() {
  return inspectionScope(readFocusScope(useValue), useValue($inspectionFocus))
}

function settleInspection(inspection) {
  // Native dispatch can drain microtasks between window capture and the
  // host's React handler. Settle after the whole event, not between listeners.
  setTimeout(() => {
    const current = $inspectionFocus.get()
    if (current?.focus !== inspection.focus) return
    const next = readFocusScope()
    if (inspectionScope(next, current) !== inspection.focus) $inspectionFocus.set(null)
    else $inspectionFocus.set({ ...current, baseline: next.fingerprint })
  }, 0)
}

function retainInspectionFocus(navigation = false) {
  const raw = readFocusScope()
  const current = $inspectionFocus.get()
  if (current && inspectionScope(raw, current) === current.focus) {
    if (navigation && !current.navigation) $inspectionFocus.set({ ...current, navigation: true })
    return
  }
  $inspectionFocus.set(null)
  if (!hasSession(raw)) return
  const inspection = { focus: raw, baseline: null, navigation }
  $inspectionFocus.set(inspection)
  settleInspection(inspection)
}

function adoptNavigationFocus() {
  const pending = pendingNavigation
  pendingNavigation = null
  const current = $inspectionFocus.get()
  if (current && inspectionScope(readFocusScope(), current) === current.focus) {
    if (!current.navigation) $inspectionFocus.set({ ...current, navigation: true })
    return
  }
  if (!pending || Date.now() - pending.at > NAVIGATION_WINDOW_MS) return
  const inspection = { focus: pending.focus, baseline: null, navigation: true }
  $inspectionFocus.set(inspection)
  settleInspection(inspection)
}

function installInspectionFocus(ctx) {
  if (typeof window === 'undefined' || !window.addEventListener) return
  let pointerOutside = false
  let releaseTimer = null
  const isOwn = event => (event.composedPath?.() || [event.target]).some(node => node?.closest?.('[data-honcho-surface]'))
  const onOwnRoute = () => window.location.hash === `#${ROUTE}`
  const cancelRelease = () => {
    if (releaseTimer) clearTimeout(releaseTimer)
    releaseTimer = null
  }
  const releaseLater = delay => {
    cancelRelease()
    releaseTimer = setTimeout(() => {
      releaseTimer = null
      pointerOutside = false
      $inspectionFocus.set(null)
    }, delay)
  }
  // Remember the chat in view when the user acts outside the plugin. If that
  // action opens the Honcho page, the page inspects this chat instead of
  // whatever the host focuses during navigation. This reads SDK state only.
  const rememberChat = () => {
    const effective = inspectionScope(readFocusScope())
    pendingNavigation = hasSession(effective) ? { focus: effective, at: Date.now() } : null
  }
  // Capture runs before the host's pane-focus handler. Portalled menus and
  // dialogs carry their own marker because they render outside the plugin.
  const onCapture = event => {
    if (isOwn(event)) {
      cancelRelease()
      retainInspectionFocus(false)
      return
    }
    if (event.type === 'pointerdown') {
      pointerOutside = true
      rememberChat()
      // The click decides; this only covers a press that never becomes one.
      releaseLater(1_000)
    } else if (event.type === 'keydown' && (event.key === 'Enter' || event.key === ' ')) {
      rememberChat()
    } else if (event.type === 'focusin' && !pointerOutside) {
      // Keyboard focus left the plugin. A pointer press is settled by its click.
      rememberChat()
      releaseLater(0)
    }
  }
  // Bubble runs after the host's handlers, so a navigation they performed is
  // already visible in the location. A portalled Select can retarget its
  // opening click to the document, so only a press that began outside counts.
  const onClick = event => {
    if (isOwn(event)) return
    if (onOwnRoute()) {
      cancelRelease()
      pointerOutside = false
      adoptNavigationFocus()
    } else if (pointerOutside) {
      cancelRelease()
      pointerOutside = false
      $inspectionFocus.set(null)
    }
  }
  const checkScope = () => {
    const current = $inspectionFocus.get()
    if (current && inspectionScope(readFocusScope(), current) !== current.focus) $inspectionFocus.set(null)
  }
  // Derived focus/owner atoms settle separately. Request guards still check
  // the live combination synchronously before every dispatch.
  const onScopeChange = () => queueMicrotask(checkScope)
  const onRouteChange = () => {
    if (onOwnRoute()) adoptNavigationFocus()
    else {
      pendingNavigation = null
      $inspectionFocus.set(null)
    }
  }
  const captured = ['pointerdown', 'focusin', 'keydown']
  for (const name of captured) window.addEventListener(name, onCapture, true)
  window.addEventListener('click', onClick)
  window.addEventListener('hashchange', onRouteChange)
  const dispose = Object.entries(host.state)
    .filter(([name]) => ['profile', 'connectionId', 'cwd', 'focusedSessionProfile', 'focusedSessionOwner', 'focusedStoredSessionId', 'focusedSessionId'].includes(name))
    .map(([, store]) => store.listen?.(onScopeChange))
  ctx.onDispose(() => {
    for (const name of captured) window.removeEventListener(name, onCapture, true)
    window.removeEventListener('click', onClick)
    window.removeEventListener('hashchange', onRouteChange)
    for (const unbind of dispose) unbind?.()
    cancelRelease()
    pendingNavigation = null
    $inspectionFocus.set(null)
  })
}

function openWorkbench() {
  retainInspectionFocus(true)
  host.navigate(ROUTE)
}

function blockMessage(reason) {
  return reason === 'other_connection'
    ? t('this_chat_runs_on_another_hermes_connection_switch_hermes_to')
    : t('hermes_can_t_tell_which_profile_owns_this_chat_so_honcho_rea')
}

function assertCurrentFocus(focus) {
  const current = inspectionScope(readFocusScope())
  if (current.fingerprint !== focus.fingerprint || current.routeMismatch) {
    throw new Error(t('the_focused_chat_changed_refresh_and_confirm_the_new_target'))
  }
}

// ── Transport ───────────────────────────────────────────────────────────────

async function requestForFocus(focus, endpoint, options) {
  if (!requestPlugin) throw new Error(t('the_honcho_plugin_backend_is_not_registered'))
  if (focus.routeMismatch) throw new Error(blockMessage(focus.blockReason))
  assertCurrentFocus(focus)
  let targetProfile = focus.ownerProfile
  if (focus.ownerConnection !== 'local') {
    if (typeof host.profileRoutes !== 'function') throw new Error(t('update_hermes_desktop_to_enable_remote_profile_routing'))
    const routes = await queryClient.fetchQuery({
      queryKey: [PLUGIN_ID, 'profile-routes', focus.ownerConnection, focus.ownerProfile],
      queryFn: () => host.profileRoutes(),
      staleTime: focus.backendProfile ? 0 : POLL_INTERVAL_MS,
      retry: false
    })
    const matches = routes.filter(route => route.connectionId === focus.ownerConnection && route.profile === focus.ownerProfile)
    if (matches.length !== 1 || !matches[0].targetProfile?.trim()) {
      throw new Error(t('the_remote_profile_route_is_unavailable_or_ambiguous_no_honc'))
    }
    targetProfile = matches[0].targetProfile
  }
  if (focus.backendProfile && targetProfile !== focus.backendProfile) {
    throw new Error(t('the_remote_profile_target_changed_after_confirmation_refresh'))
  }
  // ctx.rest chooses its connection at dispatch time, not when React rendered.
  // Recheck after async route discovery (and before multipart content leaves).
  assertCurrentFocus(focus)
  // The selector picks the owner's Hermes home on a shared backend. Electron
  // keeps an explicit ?profile=, so a chat from another local profile is read
  // in that profile rather than the active one.
  const path = `${endpoint}${endpoint.includes('?') ? '&' : '?'}profile=${encodeURIComponent(targetProfile)}`
  return requestPlugin(path, {
    ...options,
    ...(options.body ? { body: { ...options.body, profile: targetProfile, focused_profile: targetProfile } } : {})
  })
}

function useEndpointForFocus(focus, endpoint, keyParts = [], extraBody = {}, options = {}) {
  const enabled = options.enabled !== false && !focus.routeMismatch
  const query = useQuery({
    queryKey: [PLUGIN_ID, endpoint, ...focus.key, ...keyParts],
    queryFn: () => requestForFocus(focus, endpoint, {
      method: 'POST',
      body: { ...focus.body, ...extraBody },
      timeoutMs: 22_000
    }),
    enabled,
    refetchInterval: options.poll ? POLL_INTERVAL_MS : false,
    staleTime: options.staleTime ?? 15_000,
    retry: options.retry ?? 1
  })

  return { ...query, ...focus }
}

function useHonchoEndpoint(endpoint, keyParts = [], extraBody = {}, options = {}) {
  return useEndpointForFocus(useFocusScope(), endpoint, keyParts, extraBody, options)
}

function useHonchoSnapshot(options = {}) {
  return useHonchoEndpoint('/snapshot', [], {}, { ...options, poll: true, staleTime: 5_000 })
}

function refreshFocus(client, key) {
  return client.invalidateQueries({
    predicate: candidate => candidate.queryKey[0] === PLUGIN_ID &&
      key.every((part, index) => candidate.queryKey[index + 2] === part)
  })
}

// ── Status ──────────────────────────────────────────────────────────────────

// The snapshot is "ok" whenever any workspace read succeeds, so a draft or an
// unsaved chat arrives as ok with no found session. Gate on the chat itself.
function chatState(data) {
  if (!data?.ok || !data.chat || data.chat.found === true) return null
  return data.chat.honcho_session_id ? 'session_missing' : 'session_unresolved'
}

function connectionStatus(query) {
  const data = query.data
  if (query.routeMismatch) return { tone: 'warn', label: query.blockReason === 'other_connection' ? t('other_connection') : t('owner_unknown') }
  if (query.isError && !data) return { tone: 'bad', label: t('unavailable') }
  if (!data) return { tone: 'muted', label: t('checking') }
  if (chatState(data)) return { tone: 'muted', label: t('not_saved_yet') }
  if (data.ok) return data.errors?.length ? { tone: 'warn', label: t('partial') } : { tone: 'good', label: t('connected') }
  switch (data.state) {
    case 'not_configured': return { tone: 'warn', label: t('not_set_up') }
    case 'disabled': return { tone: 'warn', label: t('turned_off') }
    case 'workspace_missing': return { tone: 'warn', label: t('no_workspace') }
    case 'session_missing':
    case 'session_unresolved': return { tone: 'muted', label: t('not_saved_yet') }
    case 'route_mismatch': return { tone: 'warn', label: t('blocked') }
    case 'partial': return { tone: 'warn', label: t('partial') }
    case 'unreachable':
    case 'error': return { tone: 'bad', label: t('unreachable') }
    default: return { tone: 'muted', label: t('checking') }
  }
}

function setupCommand(profile) {
  return profile && profile !== 'default' ? `hermes -p ${profile} memory setup honcho` : 'hermes memory setup honcho'
}

function code(value) {
  return jsx('code', { className: 'font-mono text-[0.92em] text-foreground', children: value })
}

// One state replaces every memory section when nothing can be read. Status
// stays reachable because it is where these conditions are explained.
function gateFor(query) {
  if (query.routeMismatch) {
    return query.blockReason === 'other_connection'
      ? { icon: 'debug-disconnect', title: t('this_chat_is_on_another_connection'), description: blockMessage(query.blockReason) }
      : { icon: 'question', title: t('can_t_tell_who_owns_this_chat'), description: blockMessage(query.blockReason) }
  }
  if (query.isError && !query.data) {
    return {
      icon: 'error',
      title: t('can_t_reach_the_honcho_plugin'),
      description: `${query.error?.message || t('the_plugin_api_did_not_answer')} Enable hermes-honcho-plugin for this profile and restart Hermes.`,
      retry: true
    }
  }
  const data = query.data
  if (!data) return null
  const state = data.ok ? chatState(data) : data.state
  if (!state) return null
  const message = data.errors?.[0]?.message
  switch (state) {
    case 'not_configured':
      return { icon: 'settings-gear', title: t('honcho_isn_t_set_up_for_this_profile'), description: jsxs('span', { children: [t('run'), code(setupCommand(data.profile || query.ownerProfile)), t('then_refresh')] }), retry: true }
    case 'disabled':
      return { icon: 'circle-slash', title: t('honcho_is_turned_off_for_this_profile'), description: jsxs('span', { children: [t('turn_it_on_with'), code(setupCommand(data.profile || query.ownerProfile)), t('then_refresh')] }), retry: true }
    case 'workspace_missing':
      return { icon: 'database', title: t('this_honcho_workspace_doesn_t_exist_yet'), description: t('hermes_creates_it_when_it_first_saves_memory_this_view_only_'), status: true }
    case 'session_unresolved':
      return { icon: 'comment-discussion', title: t('no_honcho_session_for_this_chat'), description: t('open_a_saved_chat_or_send_a_message_here_memory_appears_once') }
    case 'session_missing':
      return { icon: 'comment-discussion', title: t('this_chat_isn_t_in_honcho_yet'), description: jsxs('span', { children: [t('hermes_saves_it_as'), code(text(data.chat?.honcho_session_id || data.session_id)), t('after_the_first_message')] }), status: true }
    case 'unreachable':
    case 'error':
      return { icon: 'error', title: t('honcho_isn_t_responding'), description: message || t('check_the_honcho_server_for_this_profile'), retry: true }
    default:
      return { icon: 'warning', title: t('honcho_memory_is_unavailable'), description: message || t('open_status_for_details'), status: true }
  }
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function StateLine({ tone = 'muted', title, children }) {
  return jsxs('div', {
    role: tone === 'bad' ? 'alert' : 'status',
    className: 'flex items-start gap-2 py-1',
    children: [
      jsx(StatusDot, { tone, className: 'mt-1.5' }),
      jsxs('div', {
        className: 'min-w-0',
        children: [
          jsx('div', { className: cn('text-xs font-medium', tone === 'bad' ? 'text-destructive' : 'text-foreground'), children: title }),
          children
            ? jsx('div', { ...SELECTABLE, className: 'mt-0.5 text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children })
            : null
        ]
      })
    ]
  })
}

function Diagnostics({ errors }) {
  if (!errors?.length) return jsx(StateLine, { tone: 'good', title: t('no_problems_found'), children: t('every_honcho_read_answered') })
  return jsx('ul', {
    ...SELECTABLE,
    className: 'space-y-2',
    children: errors.map((error, index) => jsxs('li', {
      className: 'min-w-0',
      children: [
        jsx('div', { className: 'text-xs font-medium text-foreground', children: sentence(text(error.scope, 'read').replaceAll('.', ' ')) }),
        jsx('div', { className: 'mt-0.5 text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: text(error.message) })
      ]
    }, `${error.scope}-${index}`))
  })
}

function LoadingRows({ rows = 4 }) {
  return jsx('div', {
    className: 'space-y-2',
    'aria-busy': 'true',
    'aria-label': t('loading'),
    children: Array.from({ length: rows }, (_, index) => jsx(Skeleton, { className: 'h-10', style: { width: index === rows - 1 ? '66%' : '100%' } }, index))
  })
}

function QueryState({ query, children }) {
  if (query.routeMismatch) return jsx(StateLine, { tone: 'warn', title: t('reads_paused'), children: blockMessage(query.blockReason) })
  if (query.isLoading) return jsx(LoadingRows, {})
  if (query.isError && !query.data) {
    return jsxs('div', {
      className: 'space-y-2',
      children: [
        jsx(StateLine, { tone: 'bad', title: t('couldn_t_load_this'), children: query.error instanceof Error ? query.error.message : t('the_plugin_api_did_not_answer') }),
        jsx(Button, { variant: 'secondary', size: 'sm', disabled: query.isFetching, onClick: () => query.refetch(), children: query.isFetching ? 'Retrying…' : 'Try again' })
      ]
    })
  }
  if (query.data?.errors?.length) {
    return jsxs('div', { className: 'space-y-3', children: [jsx(Diagnostics, { errors: query.data.errors }), children] })
  }
  return children
}

function RegionHeading({ children, meta, actions }) {
  return jsxs('div', {
    className: 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1',
    children: [
      jsx('h2', { className: 'text-[13px] font-medium text-foreground', children }),
      meta ? jsx('span', { className: 'text-xs tabular-nums text-(--ui-text-tertiary)', children: meta }) : null,
      actions ? jsx('div', { className: 'ml-auto flex items-center gap-1', children: actions }) : null
    ]
  })
}

function Empty({ icon, title, description, action }) {
  return jsx(PanelEmpty, { icon, title, description, action })
}

function DetailRow({ label, value, mono = false, accent = false }) {
  const layout = useLayout()
  return jsxs('div', {
    className: 'grid min-w-0 gap-3 py-1',
    style: { gridTemplateColumns: layout === 'narrow' ? '6.5rem minmax(0, 1fr)' : '8.5rem minmax(0, 1fr)' },
    children: [
      jsx('dt', { className: 'text-xs text-(--ui-text-tertiary)', children: label }),
      jsx('dd', {
        ...SELECTABLE,
        className: cn('min-w-0 text-xs text-foreground', mono && 'font-mono text-[11px]', accent && 'text-primary'),
        style: { overflowWrap: 'anywhere' },
        children: text(value)
      })
    ]
  })
}

function DetailGroup({ title, note, children }) {
  return jsxs('section', {
    className: 'min-w-0 space-y-1',
    children: [
      jsx(RegionHeading, { children: title }),
      jsx('dl', { children }),
      // Prose stays outside the definition list; a <dl> holds term groups only.
      note ? jsx('p', { className: 'pt-1 text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: note }) : null
    ]
  })
}

function ScopeToggle({ value, options, onChange, label }) {
  const layout = useLayout()
  if (layout === 'narrow') {
    return jsxs(Select, {
      value,
      onValueChange: onChange,
      children: [
        jsx(SelectTrigger, { 'aria-label': label, className: 'w-full', children: jsx(SelectValue, {}) }),
        jsx(SelectContent, { 'data-honcho-surface': '', children: options.map(option => jsx(SelectItem, { value: option.id, children: option.label }, option.id)) })
      ]
    })
  }
  return jsx('div', { role: 'group', 'aria-label': label, className: 'min-w-0', children: jsx(SegmentedControl, { value, onChange, options }) })
}

function Pager({ page, pages, isFetching, onPage }) {
  if (!pages || pages <= 1) return null
  return jsxs('div', {
    className: 'flex items-center justify-between gap-2 pt-1',
    children: [
      jsxs(Button, { variant: 'ghost', size: 'sm', disabled: page <= 1 || isFetching, onClick: () => onPage(Math.max(1, page - 1)), children: [jsx(icons.ChevronLeft, {}), t('previous')] }),
      jsx('span', { className: 'text-xs tabular-nums text-(--ui-text-secondary)', children: t('page_of_n', number(page), number(pages)) }),
      jsxs(Button, { variant: 'ghost', size: 'sm', disabled: page >= pages || isFetching, onClick: () => onPage(Math.min(pages, page + 1)), children: [t('next'), jsx(icons.ChevronRight, {})] })
    ]
  })
}

function CapabilityNote({ query, feature }) {
  if (query.data?.capabilities?.[feature]) return null
  return jsx('p', {
    className: 'text-xs leading-5 text-(--ui-text-secondary)',
    style: PROSE,
    children: query.isLoading
      ? t('checking_what_this_honcho_server_supports')
      : query.error?.message || query.data?.errors?.[0]?.message || query.data?.reasons?.[feature] || t('not_available_on_this_honcho_server_or_sdk')
  })
}

function submitOnEnter(handler) {
  return event => {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing || event.isComposing) return
    event.preventDefault()
    handler()
  }
}

// ── Header and navigation ───────────────────────────────────────────────────

function Lineage({ focus, snapshot }) {
  const chat = snapshot?.data?.chat
  const config = snapshot?.data?.config
  const items = [
    ['Connection', focus.ownerConnection],
    ['Profile', snapshot?.data?.profile || focus.ownerProfile],
    ['Session', chat?.honcho_session_id],
    ['Peer', config?.user_peer]
  ]
  return jsx('dl', {
    ...SELECTABLE,
    'aria-label': t('where_this_memory_lives'),
    className: 'flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs',
    children: items.map(([label, value]) => jsxs('div', {
      className: 'flex min-w-0 items-baseline gap-1.5',
      children: [
        jsx('dt', { className: 'shrink-0 text-(--ui-text-tertiary)', children: label }),
        jsx('dd', { className: 'min-w-0 font-mono text-[11px] text-foreground', style: { overflowWrap: 'anywhere' }, children: text(value, '—') })
      ]
    }, label))
  })
}

function PageHeader({ query, origin = 'page' }) {
  const client = useQueryClient()
  const status = connectionStatus(query)
  const canUpload = Boolean(query.data?.ok && query.data?.chat?.found && !query.routeMismatch)
  return jsxs('header', {
    className: 'flex min-w-0 flex-col gap-2',
    children: [
      jsxs('div', {
        className: 'flex min-w-0 items-center gap-2',
        children: [
          origin === 'pane' ? null : jsx('h1', { className: 'text-sm font-semibold text-foreground', children: t('honcho_memory') }),
          jsxs('span', {
            role: 'status',
            className: 'inline-flex min-w-0 items-center gap-1.5 text-xs text-(--ui-text-secondary)',
            children: [jsx(StatusDot, { tone: status.tone }), status.label]
          }),
          jsxs('div', {
            className: 'ml-auto flex shrink-0 items-center gap-1',
            children: [
              jsx(Tip, {
                label: t('refresh'),
                children: jsx(Button, {
                  variant: 'ghost',
                  size: 'icon-sm',
                  'aria-label': t('refresh'),
                  disabled: query.routeMismatch,
                  onClick: () => refreshFocus(client, query.key),
                  children: jsx(icons.RefreshCw, {})
                })
              }),
              jsxs(Button, {
                variant: 'secondary',
                size: 'sm',
                disabled: !canUpload,
                onClick: () => $uploadOrigin.set({ origin, fingerprint: query.fingerprint }),
                children: [jsx(icons.Upload, {}), t('add_to_session')]
              })
            ]
          })
        ]
      }),
      jsx(Lineage, { focus: query, snapshot: query })
    ]
  })
}

function SectionNav({ origin, snapshot }) {
  const active = useValue($activeTab)
  const layout = useLayout()
  // Only counts that match the section's default view. Conclusions span
  // scopes, so a single number would disagree with the list below it.
  const counts = { messages: snapshot.data?.chat?.messages }
  const current = SECTIONS.find(section => section.id === active) || SECTIONS[0]
  const countLabel = id => (counts[id] === null || counts[id] === undefined ? null : number(counts[id]))

  if (layout === 'narrow') {
    return jsx('div', {
      className: 'border-b border-(--ui-stroke-tertiary) pb-1.5',
      children: jsxs(DropdownMenu, {
        children: [
          jsx(DropdownMenuTrigger, {
            asChild: true,
            children: jsxs('button', {
              type: 'button',
              'aria-label': t('section_label', t(current.label)),
              className: 'flex h-7 cursor-pointer items-center gap-1.5 px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-foreground',
              children: [
                t(current.label),
                countLabel(current.id) ? jsx('span', { className: 'text-[0.72em] font-normal text-(--ui-text-tertiary)', children: countLabel(current.id) }) : null,
                jsx(Codicon, { name: 'chevron-down', className: 'text-muted-foreground', size: '0.75rem' })
              ]
            })
          }),
          jsx(DropdownMenuContent, {
            'data-honcho-surface': '',
            align: 'start',
            className: 'w-44',
            sideOffset: 6,
            children: SECTIONS.map(section => jsxs(DropdownMenuItem, {
              className: cn(section.id === active && 'text-foreground'),
              onSelect: () => $activeTab.set(section.id),
              children: [
                jsx('span', { className: 'min-w-0 flex-1 truncate', children: t(section.label) }),
                countLabel(section.id) ? jsx('span', { className: 'text-xs text-muted-foreground', children: countLabel(section.id) }) : null
              ]
            }, section.id))
          })
        ]
      })
    })
  }

  const move = (event, delta) => {
    const index = SECTIONS.findIndex(section => section.id === active)
    const next = SECTIONS[(index + delta + SECTIONS.length) % SECTIONS.length]
    event.preventDefault()
    $activeTab.set(next.id)
    document.getElementById(`honcho-${origin}-tab-${next.id}`)?.focus()
  }

  return jsx('div', {
    role: 'tablist',
    'aria-label': t('honcho_memory_sections'),
    className: 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--ui-stroke-tertiary) pb-1.5',
    onKeyDown: event => {
      if (event.key === 'ArrowRight') move(event, 1)
      else if (event.key === 'ArrowLeft') move(event, -1)
    },
    children: SECTIONS.map(section => {
      const selected = section.id === active
      return jsxs('button', {
        type: 'button',
        role: 'tab',
        id: `honcho-${origin}-tab-${section.id}`,
        'aria-selected': selected,
        'aria-controls': `honcho-${origin}-section`,
        tabIndex: selected ? 0 : -1,
        'data-active': selected,
        className: cn(TEXT_TAB, selected && 'text-foreground'),
        onClick: () => $activeTab.set(section.id),
        children: [
          jsx('span', { className: cn('underline-offset-4 decoration-current/25', selected ? 'underline' : 'group-hover/text-tab:underline'), children: t(section.label) }),
          countLabel(section.id) ? jsx('span', { className: 'text-[0.72em] font-normal tabular-nums text-(--ui-text-tertiary)', children: countLabel(section.id) }) : null
        ]
      }, section.id)
    })
  })
}

function GateState({ gate, query }) {
  const client = useQueryClient()
  return jsx(Empty, {
    icon: gate.icon,
    title: gate.title,
    description: gate.description,
    action: gate.retry
      ? jsxs(Button, { variant: 'secondary', size: 'sm', onClick: () => refreshFocus(client, query.key), children: [jsx(icons.RefreshCw, {}), t('try_again')] })
      : gate.status
        ? jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => $activeTab.set('status'), children: t('view_status') })
        : null
  })
}

// ── Memory ──────────────────────────────────────────────────────────────────

function levelLabel(level) {
  return level ? sentence(level) : null
}

function conclusionMeta(conclusion, { includeScope = true } = {}) {
  const parents = conclusion.source_ids?.length || 0
  return [
    levelLabel(conclusion.level),
    Number.isInteger(conclusion.times_derived) && conclusion.times_derived > 1 ? `Derived ${number(conclusion.times_derived)} times` : null,
    parents ? `${plural(parents, 'premise')}${conclusion.source_ids_truncated ? '+' : ''}` : null,
    formatDate(conclusion.created_at),
    includeScope && conclusion.belongs_to_current_session === false ? t('other_session') : null
  ].filter(Boolean)
}

function MetaLine({ parts }) {
  return jsx('span', {
    className: 'flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-(--ui-text-tertiary)',
    children: parts.flatMap((part, index) => index ? [jsx('span', { 'aria-hidden': 'true', children: '·' }, `dot-${index}`), jsx('span', { children: part }, index)] : [jsx('span', { children: part }, index)])
  })
}

function ConclusionRow({ conclusion, selected = false, onSelect }) {
  const body = [
    jsx('span', { className: 'block text-[13px] leading-5 text-foreground', style: PROSE, children: inlineMarkdown(conclusion.content) }, 'content'),
    jsx(MetaLine, { parts: conclusionMeta(conclusion) }, 'meta')
  ]
  if (!onSelect) return jsx('div', { className: 'flex min-w-0 flex-col gap-1 px-2.5 py-2', children: body })
  return jsx('button', {
    type: 'button',
    'aria-current': selected ? 'true' : undefined,
    onClick: () => onSelect(conclusion.id),
    className: cn(
      'flex w-full min-w-0 flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-(--ui-row-hover-background) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      selected && 'bg-(--ui-row-active-background)'
    ),
    children: body
  })
}

function ConclusionList({ items, selectedId, onSelect }) {
  return jsx('ul', {
    className: 'min-w-0 space-y-0.5',
    style: BLEED,
    children: items.map(item => jsx('li', { children: jsx(ConclusionRow, { conclusion: item, selected: item.id === selectedId, onSelect }) }, item.id))
  })
}

function correctionTarget(data) {
  return {
    workspace_id: data.config.workspace_id,
    session_id: data.chat.honcho_session_id,
    observer_id: data.config.ai_peer,
    observed_id: data.config.user_peer
  }
}

function SessionContext({ enabled = true, extra = null }) {
  const context = useHonchoEndpoint('/context', [2048], { token_budget: 2048 }, { staleTime: 60_000, enabled })
  const data = context.data
  // The stored summary, not the budgeted preview: a 2,048-token preview has
  // no room for most summaries, which is not the same as having none.
  const stored = storedSummary(data?.stored_summaries)
  const summary = stored?.content || data?.session?.summary
  return jsx(QueryState, {
    query: context,
    children: jsxs('div', {
      className: 'space-y-6',
      children: [
        jsxs('section', {
          className: 'space-y-2',
          children: [
            jsx(RegionHeading, { meta: stored?.created_at ? `Updated ${formatDate(stored.created_at)}` : null, children: t('session_summary') }),
            summary
              ? jsx(Markdown, { source: summary })
              : jsx('p', {
                  className: 'text-xs leading-5 text-(--ui-text-secondary)',
                  style: PROSE,
                  children: data?.stored_summaries ? t('no_summary_yet_honcho_writes_one_after_enough_messages') : t('honcho_didn_t_return_a_summary')
                })
          ]
        }),
        jsxs('section', {
          className: 'space-y-2',
          children: [
            jsx(RegionHeading, { meta: t('whole_workspace'), children: t('peer_card') }),
            jsx(PeerCardFacts, { facts: data?.peer_card })
          ]
        }),
        extra,
        jsx(Button, { variant: 'link', size: 'inline', onClick: () => $activeTab.set('context'), children: t('open_the_full_context') })
      ]
    })
  })
}

// Content mounts only when opened, so a closed disclosure never fetches.
function Disclosure({ label, meta, indent = true, children }) {
  const [open, setOpen] = useState(false)
  return jsxs('div', {
    className: 'min-w-0',
    children: [
      jsxs('button', {
        type: 'button',
        'aria-expanded': open,
        onClick: () => setOpen(value => !value),
        className: 'flex items-center gap-1.5 py-1 text-xs font-medium text-(--ui-text-secondary) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        children: [
          jsx(DisclosureCaret, { open }),
          label,
          meta ? jsx('span', { className: 'font-normal tabular-nums text-(--ui-text-tertiary)', children: meta }) : null
        ]
      }),
      open ? jsx('div', { className: indent ? 'pt-2 pl-5' : 'pt-2', children: typeof children === 'function' ? children() : children }) : null
    ]
  })
}

function SummaryDisclosure() {
  return jsx(Disclosure, { label: t('session_summary_and_peer_card'), children: () => jsx(SessionContext, {}) })
}

// ── Custom instructions ─────────────────────────────────────────────────────
// Honcho 3.3 agents that follow custom instructions, in Honcho's order.
// "Answers" covers Ask memory and Hermes's own recall questions.
const INSTRUCTION_AGENTS = [
  ['reasoning', 'Conclusions'],
  ['summary', 'Summaries'],
  ['dialectic', 'Answers'],
  ['dream', 'Dreams'],
  ['peer_card', t('peer_card')]
]
const INSTRUCTION_FOLD = '7.5rem'

// One cache entry for every surface. The backend shows nothing on servers
// older than 3.3.0, where these keys exist but no agent reads them.
function useInstructions() {
  return useHonchoEndpoint('/instructions', [], {}, { staleTime: 60_000 })
}

function instructionsReady(query) {
  return Boolean(query.data?.capabilities?.instructions)
}

// Distinct settings: the shared text plus each agent that sets its own.
function instructionsMeta(data) {
  if (!data?.configured) return t('none_set')
  const shared = data.shared?.source
  const own = (data.agents || []).filter(entry => entry.source && entry.source !== shared).length
  return `${number(own + (shared ? 1 : 0))} set`
}

function SourceTag({ source }) {
  return jsx('code', { className: 'font-mono text-[11px] text-(--ui-text-tertiary)', children: source })
}

function InstructionText({ value, truncated = false }) {
  const [open, setOpen] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    if (open || !element) return undefined
    const update = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [value, open])
  return jsxs('div', {
    className: 'min-w-0 space-y-1',
    children: [
      jsx('p', {
        ref,
        className: 'whitespace-pre-wrap text-xs leading-5 text-foreground',
        style: { ...PROSE, ...(open ? {} : { maxHeight: INSTRUCTION_FOLD, overflow: 'hidden', ...(overflowing ? { WebkitMaskImage: FOLD_MASK, maskImage: FOLD_MASK } : {}) }) },
        children: value
      }),
      truncated ? jsx('p', { className: 'text-[11px] text-(--ui-text-tertiary)', children: t('shortened_for_display') }) : null,
      overflowing || open ? jsx(InlineToggle, { open, onClick: () => setOpen(current => !current), children: open ? 'Fold' : t('show_all') }) : null
    ]
  })
}

function InstructionRow({ label, entry, shared }) {
  const layout = useLayout()
  const usesShared = Boolean(entry?.source && !entry.off && shared?.source === entry.source)
  const status = !entry?.source ? t('not_set') : entry.off ? 'Off' : usesShared ? t('uses_the_shared_text') : null
  return jsxs('li', {
    className: 'grid min-w-0 py-1.5',
    style: { gridTemplateColumns: layout === 'narrow' ? '6.5rem minmax(0, 1fr)' : '8.5rem minmax(0, 1fr)', columnGap: 12, alignItems: 'baseline' },
    children: [
      jsx('span', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: label }),
      jsxs('div', {
        className: 'min-w-0 space-y-1',
        children: [
          entry?.text && !usesShared ? jsx(InstructionText, { value: entry.text, truncated: entry.text_truncated }) : null,
          jsxs('div', {
            className: 'flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs leading-5',
            children: [
              status ? jsx('span', { className: 'text-(--ui-text-secondary)', children: status }) : null,
              entry?.source ? jsx(SourceTag, { source: entry.source }) : null
            ]
          })
        ]
      })
    ]
  })
}

function InstructionsList({ data }) {
  if (data.errors?.length) return jsx(Diagnostics, { errors: data.errors })
  if (!data.configured) {
    return jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: t('none_set_honcho_uses_its_built_in_prompts') })
  }
  const byModule = Object.fromEntries((data.agents || []).map(entry => [entry.module, entry]))
  return jsxs('div', {
    className: 'min-w-0 space-y-2',
    children: [
      jsx('ul', {
        ...SELECTABLE,
        'aria-label': t('custom_instructions_by_agent'),
        className: 'min-w-0',
        children: [
          jsx(InstructionRow, { label: t('shared'), entry: data.shared }, 'shared'),
          ...INSTRUCTION_AGENTS.map(([module, label]) => jsx(InstructionRow, { label, entry: byModule[module], shared: data.shared }, module))
        ]
      }),
      jsx('p', {
        className: 'text-xs leading-5 text-(--ui-text-secondary)',
        style: PROSE,
        children: t('session_settings_win_over_workspace_settings_instructions_at')
      })
    ]
  })
}

function InstructionsRegion() {
  const query = useInstructions()
  if (!instructionsReady(query)) return null
  return jsxs('section', {
    className: 'space-y-2',
    children: [
      jsx(RegionHeading, { meta: instructionsMeta(query.data), children: t('custom_instructions') }),
      jsx(InstructionsList, { data: query.data })
    ]
  })
}

function InstructionsDisclosure() {
  const query = useInstructions()
  if (!instructionsReady(query)) return null
  return jsx(Disclosure, { label: t('custom_instructions'), meta: instructionsMeta(query.data), children: () => jsx(InstructionsList, { data: query.data }) })
}

// Under the Ask composer: the instructions this question's answer follows.
// Questions across sessions have no session, so Honcho reads only the
// workspace's setting for them.
function AnswerInstructions({ scope }) {
  const query = useInstructions()
  const [open, setOpen] = useState(false)
  if (!instructionsReady(query) || query.data.errors?.length) return null
  const entry = scope === 'session' ? query.data.agents?.find(item => item.module === 'dialectic') : query.data.across_sessions
  if (!entry?.source) return null
  const where = scope === 'session' ? t('in_this_session') : t('across_sessions')
  return jsxs('div', {
    className: 'min-w-0 space-y-1',
    children: [
      jsxs('div', {
        className: 'flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs leading-5 text-(--ui-text-secondary)',
        children: [
          jsx('span', { children: entry.off ? t('instructions_off_for', where) : t('instructions_follow_for', where) }),
          jsx(SourceTag, { source: entry.source }),
          entry.off ? null : jsx(InlineToggle, { open, onClick: () => setOpen(current => !current), children: open ? 'Hide' : 'Show' })
        ]
      }),
      open && !entry.off ? jsx(InstructionText, { value: entry.text, truncated: entry.text_truncated }) : null
    ]
  })
}

function ConclusionInspector({ id, fallback, flags, onSelect, onClose, onCorrect, backLabel }) {
  const query = useHonchoEndpoint('/conclusion-detail', [id], { conclusion_id: id }, { enabled: Boolean(flags.conclusion_detail) })
  const heading = useRef(null)
  useEffect(() => { heading.current?.focus() }, [id])
  const data = query.data
  const item = data?.item || fallback
  const loading = flags.conclusion_detail && query.isLoading

  return jsxs('section', {
    'aria-label': t('selected_conclusion'),
    className: 'min-w-0 space-y-4',
    children: [
      jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          backLabel
            ? jsxs(Button, { variant: 'ghost', size: 'sm', onClick: onClose, children: [jsx(icons.ChevronLeft, {}), backLabel] })
            : jsx('h2', { ref: heading, tabIndex: -1, className: 'text-[13px] font-medium text-foreground outline-none', children: t('conclusion') }),
          backLabel
            ? null
            : jsx('div', {
                className: 'ml-auto',
                children: jsx(Tip, { label: t('close'), children: jsx(Button, { variant: 'ghost', size: 'icon-xs', 'aria-label': t('close_conclusion'), onClick: onClose, children: jsx(Codicon, { name: 'close', size: '0.875rem' }) }) })
              })
        ]
      }),
      loading ? jsx(LoadingRows, { rows: 3 }) : null,
      !loading && !item
        ? jsx(StateLine, { tone: 'warn', title: t('conclusion_not_found'), children: query.data?.errors?.[0]?.message || query.error?.message || t('it_may_have_been_removed_or_it_belongs_to_another_relationsh') })
        : null,
      !loading && item
        ? jsxs('div', {
            className: 'space-y-4',
            children: [
              backLabel ? jsx('h2', { ref: heading, tabIndex: -1, className: 'sr-only', children: t('conclusion') }) : null,
              jsx('p', { ...SELECTABLE, className: 'whitespace-pre-wrap text-sm leading-6 text-foreground', style: PROSE, children: inlineMarkdown(item.content) }),
              jsxs('dl', {
                children: [
                  jsx(DetailRow, { label: t('observer'), value: item.observer_id, mono: true }),
                  jsx(DetailRow, { label: t('about'), value: item.observed_id, mono: true }),
                  jsx(DetailRow, { label: t('kind'), value: levelLabel(item.level) }),
                  jsx(DetailRow, { label: t('created'), value: formatTime(item.created_at) }),
                  jsx(DetailRow, { label: t('session'), value: item.source_session_id ? `${item.source_session_id}${item.belongs_to_current_session ? t('this_session') : ''}` : null, mono: true }),
                  Number.isInteger(item.times_derived) ? jsx(DetailRow, { label: t('derived'), value: plural(item.times_derived, 'time') }) : null,
                  jsx(DetailRow, { label: t('id'), value: item.id, mono: true })
                ]
              }),
              jsxs('div', {
                className: 'flex flex-wrap gap-2',
                children: [
                  onCorrect ? jsxs(Button, { variant: 'secondary', size: 'sm', onClick: () => onCorrect(item), children: [jsx(icons.Pencil, {}), t('add_correction')] }) : null,
                  jsx(CopyButton, { text: item.content, label: t('copy_text'), appearance: 'button', buttonVariant: 'ghost', buttonSize: 'sm', showLabel: true })
                ]
              }),
              flags.conclusion_detail
                ? jsxs('div', {
                    className: 'space-y-4',
                    children: [
                      ...[['parents', 'Premises'], ['derived', t('derived_from_this')]].map(([key, label]) => jsxs('section', {
                        className: 'space-y-1',
                        children: [
                          jsx(RegionHeading, { meta: data?.capabilities?.[key] ? number(data?.[key]?.length || 0) : null, children: label }),
                          !data?.capabilities?.[key]
                            ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: t('this_honcho_server_doesn_t_expose_these_links') })
                            : data[key]?.length
                              ? jsx(ConclusionList, { items: data[key], onSelect })
                              : jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: key === 'parents' ? 'No premises recorded.' : 'Nothing derived from it yet.' })
                        ]
                      }, key)),
                      jsx('p', {
                        className: 'text-xs leading-5 text-(--ui-text-secondary)',
                        style: PROSE,
                        children: `${data?.truncated ? t('some_links_were_left_out') : ''}Premises are earlier conclusions, not source messages. One level loads at a time, up to ten each way.`
                      })
                    ]
                  })
                : jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: t('this_honcho_sdk_can_t_load_premises_or_derived_conclusions') })
            ]
          })
        : null
    ]
  })
}

function MemorySection() {
  const layout = useLayout()
  const focus = useFocusScope()
  const snapshot = useHonchoSnapshot()
  const capability = useHonchoEndpoint('/capabilities')
  const flags = capability.data?.capabilities || {}
  const [scope, setScope] = useState('current')
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [correction, setCorrection] = useState(null)
  const list = useHonchoEndpoint(
    search ? '/conclusion-search' : '/conclusions',
    [scope, page, PAGE_SIZE, search],
    search ? { scope, query: search, limit: PAGE_SIZE } : { scope, page, size: PAGE_SIZE }
  )
  const selection = useValue($selection)
  const selectedId = selection?.fingerprint === focus.fingerprint ? selection.id : null
  const items = list.data?.items || []
  const select = id => $selection.set(id ? { id, fingerprint: focus.fingerprint } : null)
  const canCorrect = Boolean(flags.correction && snapshot.data?.ok && snapshot.data?.chat?.found && !focus.routeMismatch)
  const correct = source => setCorrection({ source, profile: snapshot.data.profile, target: correctionTarget(snapshot.data) })
  const canSearch = Boolean(flags.conclusion_search)
  const runSearch = () => {
    const cleaned = draft.trim()
    if (canSearch && cleaned && !list.isFetching) {
      setSearch(cleaned)
      setPage(1)
    }
  }
  const clearSearch = () => {
    setDraft('')
    setSearch('')
  }
  const config = snapshot.data?.config
  const relationship = config?.ai_peer && config?.user_peer ? `${config.ai_peer} about ${config.user_peer}` : null
  const total = list.data?.total ?? items.length

  const addFact = jsxs(Button, { variant: 'secondary', size: 'sm', disabled: !canCorrect, onClick: () => correct(null), children: [jsx(icons.Plus, {}), t('add_fact')] })
  const scopeControl = jsx(ScopeToggle, {
    value: scope,
    label: t('memory_scope'),
    onChange: next => {
      setScope(next)
      setPage(1)
    },
    options: [{ id: 'current', label: t('this_session') }, { id: 'all', label: t('all_sessions') }]
  })
  const toolbar = jsxs('div', {
    className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
    children: [
      canSearch
        ? jsx(SearchField, {
            value: draft,
            onChange: value => {
              setDraft(value)
              if (!value) setSearch('')
            },
            onClear: clearSearch,
            onKeyDown: submitOnEnter(runSearch),
            'aria-label': t('search_memory'),
            placeholder: t('search_memory_and_press_enter'),
            loading: Boolean(search) && list.isFetching,
            containerClassName: 'min-w-48 flex-1 opacity-100',
            inputClassName: 'w-full'
          })
        : jsx('div', { className: 'min-w-0 flex-1', children: jsx(CapabilityNote, { query: capability, feature: 'conclusion_search' }) }),
      layout === 'narrow'
        ? jsxs('div', { className: 'flex min-w-0 items-center gap-2', children: [jsx('div', { className: 'min-w-0 flex-1', children: scopeControl }), addFact] })
        : scopeControl,
      layout === 'narrow' ? null : addFact
    ]
  })

  const results = jsx(QueryState, {
    query: list,
    children: jsxs('div', {
      className: 'min-w-0 space-y-2',
      children: [
        jsx(RegionHeading, {
          meta: search ? plural(items.length, 'match', 'matches') : [plural(total, 'conclusion'), relationship].filter(Boolean).join(' · '),
          actions: search ? jsx(Button, { variant: 'text', size: 'inline', onClick: clearSearch, children: t('show_all') }) : null,
          children: search ? t('results_for', search) : scope === 'current' ? t('conclusions_from_this_session') : t('conclusions_from_all_sessions')
        }),
        items.length
          ? jsx(ConclusionList, { items, selectedId, onSelect: select })
          : jsx(Empty, {
              icon: search ? 'search' : 'lightbulb',
              title: search ? t('no_matching_conclusions') : t('no_conclusions_yet'),
              description: search
                ? t('try_other_words_or_search_all_sessions')
                : scope === 'current'
                  ? t('honcho_draws_conclusions_in_the_background_after_messages_ar')
                  : t('honcho_hasn_t_drawn_conclusions_about_this_user_yet'),
              action: scope === 'current' ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => { setScope('all'); setPage(1) }, children: t('show_all_sessions') }) : null
            }),
        search ? null : jsx(Pager, { page, pages: list.data?.pages, isFetching: list.isFetching, onPage: setPage })
      ]
    })
  }, `${scope}|${search}`)

  const inspector = selectedId
    ? jsx(ConclusionInspector, {
        id: selectedId,
        fallback: items.find(item => item.id === selectedId),
        flags,
        onSelect: select,
        onClose: () => select(null),
        onCorrect: canCorrect ? correct : undefined,
        backLabel: layout === 'wide' ? null : t('all_conclusions')
      }, selectedId)
    : null
  const dialog = correction ? jsx(CorrectionDialog, { confirmation: correction, onClose: () => setCorrection(null) }, 'correction') : null

  if (layout === 'wide') {
    return jsxs('div', {
      style: { display: 'grid', gap: 32, gridTemplateColumns: 'minmax(0, 3fr) minmax(18rem, 2fr)', alignItems: 'start' },
      children: [
        jsxs('div', { className: 'min-w-0 space-y-4', children: [toolbar, results] }),
        jsx('aside', {
          className: 'min-w-0 space-y-4',
          style: { position: 'sticky', top: 0, borderLeft: '1px solid var(--ui-stroke-tertiary)', paddingLeft: 24 },
          children: inspector || jsxs('div', {
            className: 'space-y-4',
            children: [
              jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: t('select_a_conclusion_to_see_where_it_came_from_or_correct_it') }),
              jsx(SessionContext, { extra: jsx(InstructionsRegion, {}) })
            ]
          })
        }),
        dialog
      ]
    })
  }

  return jsxs('div', {
    className: 'min-w-0 space-y-4',
    children: inspector
      ? [inspector, dialog]
      : [
          jsx('div', { children: toolbar }, 'toolbar'),
          jsxs('div', { className: 'min-w-0 space-y-1', children: [jsx(SummaryDisclosure, {}, 'summary'), jsx(InstructionsDisclosure, {}, 'instructions')] }, 'context'),
          jsx('div', { children: results }, 'results'),
          dialog
        ]
  })
}

// ── Corrections ─────────────────────────────────────────────────────────────

function sameMemoryTarget(actual, expected) {
  return Boolean(actual && expected && ['workspace_id', 'session_id', 'observer_id', 'observed_id'].every(key => actual[key] && actual[key] === expected[key]))
}

async function saveCorrectionForFocus(focus, target, content, source) {
  const ticket = await requestForFocus(focus, '/correction-ticket', {
    method: 'POST', body: { ...focus.body, content, source_conclusion_id: source || null }, timeoutMs: 22_000
  })
  if (!ticket?.ok || !ticket.ticket) throw new Error(ticket?.errors?.[0]?.message || t('honcho_couldn_t_prepare_the_correction'))
  if (!sameMemoryTarget(ticket.target, target)) throw new Error(t('the_memory_target_changed_nothing_was_sent_reopen_and_confir'))
  assertCurrentFocus(focus)
  let result
  try {
    result = await requestForFocus(focus, '/corrections', { method: 'POST', body: { ...focus.body, ticket: ticket.ticket }, timeoutMs: 22_000 })
    assertCurrentFocus(focus)
  } catch {
    const error = new Error(t('the_response_was_lost_so_the_correction_may_or_may_not_be_sa'))
    error.outcome = 'unknown'
    throw error
  }
  if (!result?.ok || !result.verified || result.outcome !== 'verified' || !sameMemoryTarget(result.target, target)
      || !result.item?.id || result.item.content !== content || result.item.observer_id !== target.observer_id
      || result.item.observed_id !== target.observed_id || result.item.source_session_id !== target.session_id) {
    const error = new Error(result?.errors?.[0]?.message || t('honcho_didn_t_confirm_the_correction_check_memory_before_add'))
    error.outcome = result?.outcome === 'rejected' ? 'rejected' : 'unknown'
    throw error
  }
  return result
}

function TargetList({ rows }) {
  return jsx('dl', {
    className: 'rounded bg-foreground/5 px-3 py-2',
    children: rows.map(([label, value]) => jsx(DetailRow, { label, value, mono: true }, label))
  })
}

function CorrectionDialog({ confirmation, onClose }) {
  const focus = useFocusScope()
  const [draft, setDraft] = useState('')
  const inFlight = useRef(false)
  const client = useQueryClient()
  const mutation = useMutation({
    retry: false,
    mutationFn: () => saveCorrectionForFocus({ ...focus, backendProfile: confirmation.profile }, confirmation.target, draft.trim(), confirmation.source?.id),
    onSuccess: () => client.invalidateQueries({ queryKey: [PLUGIN_ID] }),
    onSettled: () => { inFlight.current = false }
  })
  const blocked = mutation.isPending || mutation.data?.verified || mutation.error?.outcome === 'unknown'
  const close = () => { if (!inFlight.current) onClose() }
  return jsx(Dialog, {
    open: true,
    onOpenChange: next => { if (!next) close() },
    children: jsxs(DialogContent, {
      'data-honcho-surface': '',
      style: DIALOG_STYLE,
      showCloseButton: !mutation.isPending,
      onEscapeKeyDown: event => { if (inFlight.current) event.preventDefault() },
      onInteractOutside: event => { if (inFlight.current) event.preventDefault() },
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: confirmation.source ? t('correct_this_conclusion') : 'Add a fact' }),
            jsx(DialogDescription, { children: t('adds_one_explicit_conclusion_earlier_conclusions_stay_as_the') })
          ]
        }),
        jsx(TargetList, {
          rows: [
            ['Profile', confirmation.profile],
            ['Session', confirmation.target.session_id],
            ['Observer', confirmation.target.observer_id],
            ['About', confirmation.target.observed_id]
          ]
        }),
        confirmation.source
          ? jsxs('div', {
              className: 'space-y-1',
              children: [
                jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: t('current_conclusion') }),
                jsx('p', { ...SELECTABLE, className: 'text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: inlineMarkdown(confirmation.source.content) })
              ]
            })
          : null,
        jsx(Textarea, {
          'aria-label': t('corrective_fact'),
          value: draft,
          maxLength: 4000,
          rows: 4,
          disabled: blocked,
          placeholder: t('state_the_correct_fact_plainly_including_what_changed'),
          onChange: event => { setDraft(event.target.value); mutation.reset() }
        }),
        mutation.error ? jsx(StateLine, { tone: 'warn', title: mutation.error.outcome === 'unknown' ? t('outcome_unknown') : t('not_saved'), children: mutation.error.message }) : null,
        mutation.data?.verified ? jsx(StateLine, { tone: 'good', title: t('correction_saved_and_verified'), children: t('correction_verified_body', mutation.data.item.id) }) : null,
        jsxs(DialogFooter, {
          children: [
            jsx(Button, { variant: 'ghost', onClick: close, disabled: mutation.isPending, children: blocked && !mutation.isPending ? 'Close' : 'Cancel' }),
            jsx(Button, {
              disabled: blocked || !draft.trim() || focus.routeMismatch,
              onClick: () => {
                if (inFlight.current || blocked || !draft.trim()) return
                inFlight.current = true
                mutation.mutate()
              },
              children: mutation.isPending ? 'Saving…' : t('save_correction')
            })
          ]
        })
      ]
    })
  })
}

// ── Ask ─────────────────────────────────────────────────────────────────────

function AskSection() {
  const layout = useLayout()
  const focus = useFocusScope()
  const capability = useHonchoEndpoint('/capabilities')
  const flags = capability.data?.capabilities || {}
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState('session')
  const [level, setLevel] = useState('low')
  const inFlight = useRef(false)
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const result = await requestForFocus(focus, '/ask', {
        method: 'POST',
        body: { ...focus.body, query: draft.trim(), scope, reasoning_level: level, include_evidence: Boolean(flags.ask_evidence) },
        timeoutMs: 95_000
      })
      assertCurrentFocus(focus)
      if (!result?.ok) throw new Error(result?.errors?.[0]?.message || t('honcho_couldn_t_answer_nothing_was_retried'))
      return result
    },
    onSettled: () => { inFlight.current = false }
  })
  const result = mutation.data
  const canAsk = Boolean(flags.ask && !focus.routeMismatch && draft.trim() && !mutation.isPending)
  const ask = () => {
    if (inFlight.current || !canAsk) return
    inFlight.current = true
    mutation.mutate()
  }
  const openConclusion = id => {
    $selection.set({ id, fingerprint: focus.fingerprint })
    $activeTab.set('memory')
  }
  const wide = layout === 'wide'

  const composer = jsxs('fieldset', {
    disabled: mutation.isPending || !flags.ask || focus.routeMismatch,
    className: 'min-w-0 space-y-2',
    children: [
      jsx(Textarea, {
        'aria-label': t('question_for_memory'),
        value: draft,
        maxLength: 2000,
        rows: 3,
        placeholder: t('what_should_guide_this_work_ask_about_preferences_decisions_'),
        onChange: event => { setDraft(event.target.value); mutation.reset() },
        onKeyDown: event => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent?.isComposing) {
            event.preventDefault()
            ask()
          }
        }
      }),
      jsxs('div', {
        className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
        children: [
          jsx(ScopeToggle, { value: scope, label: t('question_scope'), onChange: value => { setScope(value); mutation.reset() }, options: [{ id: 'session', label: t('this_session') }, { id: 'workspace', label: t('all_sessions') }] }),
          jsxs(Select, {
            value: level,
            onValueChange: value => { setLevel(value); mutation.reset() },
            children: [
              jsx(SelectTrigger, { 'aria-label': t('reasoning_effort'), className: layout === 'narrow' ? 'w-full' : 'w-36', children: jsx(SelectValue, {}) }),
              jsx(SelectContent, {
                'data-honcho-surface': '',
                children: [['minimal', t('minimal_effort')], ['low', t('low_effort')], ['medium', t('medium_effort')], ['high', t('high_effort')]].map(([id, label]) => jsx(SelectItem, { value: id, children: label }, id))
              })
            ]
          }),
          jsxs(Button, {
            className: layout === 'narrow' ? 'justify-center' : 'ml-auto',
            disabled: !canAsk,
            onClick: ask,
            children: [jsx(icons.MessageQuestion, {}), mutation.isPending ? t('asking') : t('ask_memory')]
          })
        ]
      }),
      jsx('p', {
        className: 'text-xs leading-5 text-(--ui-text-secondary)',
        style: PROSE,
        children: t('runs_a_new_reasoning_call_on_your_honcho_server_which_may_us')
      })
    ]
  })
  const answer = result
    ? jsxs('section', {
        'aria-live': 'polite',
        className: 'min-w-0 space-y-2',
        children: [
          jsx(RegionHeading, {
            meta: t('new_synthesis', result.scope === 'session' ? t('this_session') : t('all_sessions')),
            actions: jsx(CopyButton, { text: result.answer || '', label: t('copy_answer') }),
            children: t('answer')
          }),
          result.answer
            ? jsx(Markdown, { source: result.answer, lead: true })
            : jsx('p', { className: 'text-sm text-(--ui-text-secondary)', children: t('honcho_returned_an_empty_answer') }),
          result.answer_truncated ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: t('the_answer_was_shortened_for_display') }) : null,
          result.errors?.length ? jsx(Diagnostics, { errors: result.errors }) : null
        ]
      })
    : null
  const evidence = result?.evidence
  const records = !result
    ? null
    : evidence
      ? jsxs('section', {
          'aria-label': t('records_honcho_read'),
          className: 'min-w-0 space-y-3',
          children: [
            jsx(RegionHeading, { meta: number(evidence.conclusions.length + evidence.messages.length), children: t('records_honcho_read') }),
            jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: t('reading_a_record_doesn_t_mean_it_supports_the_answer') }),
            evidence.conclusions.length
              ? jsxs('div', {
                  className: 'min-w-0 space-y-1',
                  children: [
                    jsxs('h3', { className: 'flex items-baseline gap-2 text-xs font-medium text-foreground', children: [t('conclusions'), jsx('span', { className: 'font-normal tabular-nums text-(--ui-text-tertiary)', children: number(evidence.conclusions.length) })] }),
                    jsx(ConclusionList, { items: evidence.conclusions, onSelect: flags.conclusion_detail ? openConclusion : undefined })
                  ]
                })
              : null,
            evidence.messages.length ? jsx(EvidenceMessages, { items: evidence.messages }) : null,
            !evidence.conclusions.length && !evidence.messages.length
              ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: t('honcho_didn_t_report_any_records') })
              : null,
            evidence.truncated ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: t('some_records_were_left_out') }) : null
          ]
        })
      : flags.ask
        ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: t('this_honcho_server_doesn_t_report_which_records_it_read') })
        : null
  const lead = [
    composer,
    jsx(AnswerInstructions, { scope }, 'instructions'),
    jsx(CapabilityNote, { query: capability, feature: 'ask' }, 'capability'),
    mutation.error ? jsx(StateLine, { tone: 'warn', title: t('no_answer'), children: mutation.error.message }, 'error') : null,
    answer
  ]

  // Wide pages read the answer beside the records Honcho consulted.
  if (wide) {
    return jsxs('div', {
      style: { display: 'grid', gap: 40, gridTemplateColumns: 'minmax(0, 40rem) minmax(18rem, 1fr)', alignItems: 'start' },
      children: [
        jsxs('div', { className: 'flex min-w-0 flex-col', style: { gap: 20 }, children: lead }),
        records
          ? jsx('aside', { className: 'min-w-0', style: { borderLeft: '1px solid var(--ui-stroke-tertiary)', paddingLeft: 24 }, children: records })
          : null
      ]
    })
  }
  return jsxs('div', {
    className: 'flex min-w-0 flex-col',
    style: { gap: 20, maxWidth: 880 },
    children: [...lead, records]
  })
}

// Honcho reports message evidence by reference only (EvidenceMessageRef has
// no text), so this lists who wrote it and when.
function EvidenceMessages({ items }) {
  return jsxs('div', {
    className: 'min-w-0 space-y-1',
    children: [
      jsxs('h3', { className: 'flex items-baseline gap-2 text-xs font-medium text-foreground', children: [t('messages'), jsx('span', { className: 'font-normal tabular-nums text-(--ui-text-tertiary)', children: number(items.length) })] }),
      jsx('ul', {
        ...SELECTABLE,
        className: 'min-w-0 space-y-1.5',
        children: items.map(item => jsxs('li', {
          className: 'min-w-0 text-xs leading-5',
          children: [
            jsxs('div', {
              className: 'flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-(--ui-text-secondary)',
              children: [
                jsx('span', { className: 'font-mono text-[11px] text-foreground', children: text(item.peer_id) }),
                item.created_at ? jsx('span', { children: formatTime(item.created_at) }) : null
              ]
            }),
            jsx('div', { className: 'font-mono text-[11px] text-(--ui-text-tertiary)', style: { overflowWrap: 'anywhere' }, children: [item.session_id, item.id].filter(Boolean).join(' · ') })
          ]
        }, item.id))
      }),
      jsx('p', { className: 'text-xs leading-5 text-(--ui-text-tertiary)', style: PROSE, children: t('honcho_lists_the_messages_it_read_by_reference_without_their') })
    ]
  })
}

// ── Messages ────────────────────────────────────────────────────────────────

// Long messages fold at about a dozen lines, the way core chat clamps long
// prompts. The fade is an alpha mask, so it follows any theme.
const MESSAGE_FOLD = '16rem'
const MESSAGE_MEASURE = '40rem'
const FOLD_MASK = 'linear-gradient(to bottom, currentColor 65%, transparent)'

function InlineToggle({ open, onClick, children }) {
  return jsxs('button', {
    type: 'button',
    'aria-expanded': open,
    onClick,
    className: 'flex items-center gap-1 text-[11px] text-(--ui-text-tertiary) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
    children: [jsx(DisclosureCaret, { open, size: '0.7rem' }), children]
  })
}

function MessageRow({ message, peers, dated = true }) {
  const layout = useLayout()
  const [open, setOpen] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)
  const bodyRef = useRef(null)
  const { continued, body } = messageBody(message.content)
  const hasMetadata = Boolean(message.metadata && Object.keys(message.metadata).length > 0)
  const assistant = peers?.ai && message.peer_id === peers.ai
  const folded = !open

  // Measure the rendered markdown rather than counting characters: a short
  // table can be taller than a long paragraph.
  useEffect(() => {
    const element = bodyRef.current
    if (!folded || !element) return undefined
    const update = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [body, folded])

  const speaker = jsx('span', {
    className: cn('font-mono text-[11px] font-medium', assistant ? 'text-(--ui-text-secondary)' : 'text-foreground'),
    style: { overflowWrap: 'anywhere' },
    children: text(message.peer_id)
  })
  const when = message.created_at
    ? jsx('time', {
        className: 'text-[11px] tabular-nums text-(--ui-text-tertiary)',
        dateTime: message.created_at,
        title: formatTime(message.created_at),
        children: dated ? formatTime(message.created_at) : formatClock(message.created_at)
      })
    : null
  const rank = message.rank ? jsx('span', { className: 'text-[11px] tabular-nums text-(--ui-text-tertiary)', children: `#${number(message.rank)}` }) : null
  const content = jsx('div', {
    ref: bodyRef,
    style: folded ? { maxHeight: MESSAGE_FOLD, overflow: 'hidden', ...(overflowing ? { WebkitMaskImage: FOLD_MASK, maskImage: FOLD_MASK } : {}) } : undefined,
    children: body.trim()
      ? jsx(Markdown, { source: body, measure: MESSAGE_MEASURE })
      : jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: t('empty_message') })
  })
  const footerParts = [
    continued ? jsx('span', { className: 'text-[11px] text-(--ui-text-tertiary)', children: t('continued_from_an_earlier_part_of_this_turn') }, 'continued') : null,
    message.token_count !== null && message.token_count !== undefined
      ? jsx('span', { className: 'text-[11px] tabular-nums text-(--ui-text-tertiary)', children: plural(message.token_count, 'token') }, 'tokens')
      : null,
    overflowing || open ? jsx(InlineToggle, { open, onClick: () => setOpen(value => !value), children: open ? t('fold_message') : t('show_full_message') }, 'fold') : null,
    hasMetadata ? jsx(InlineToggle, { open: showMetadata, onClick: () => setShowMetadata(value => !value), children: t('metadata') }, 'metadata') : null
  ].filter(Boolean)
  const footer = footerParts.length ? jsx('div', { className: 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-1', children: footerParts }) : null
  const metadata = showMetadata && hasMetadata ? jsx('pre', { className: cn(BLOCK, 'font-mono'), style: { maxWidth: MESSAGE_MEASURE }, children: JSON.stringify(message.metadata, null, 2) }) : null

  if (layout === 'narrow') {
    return jsxs('article', {
      ...SELECTABLE,
      className: 'min-w-0 space-y-1 py-2.5',
      children: [
        jsxs('div', { className: 'flex min-w-0 flex-wrap items-baseline gap-x-2', children: [rank, speaker, when] }),
        content,
        footer,
        metadata
      ]
    })
  }
  // Wider surfaces give the speaker a gutter, like the observation ledger, so
  // a long conversation scans by who spoke.
  return jsxs('article', {
    ...SELECTABLE,
    className: 'grid min-w-0 py-2.5',
    style: { gridTemplateColumns: '9rem minmax(0, 1fr)', columnGap: 16 },
    children: [
      jsxs('div', { className: 'flex min-w-0 flex-col gap-0.5', children: [speaker, when, rank] }),
      jsxs('div', { className: 'min-w-0 space-y-1', children: [content, footer, metadata] })
    ]
  })
}

function DayHeading({ date }) {
  return jsxs('h4', {
    className: 'flex min-w-0 items-center gap-3 pb-1.5 text-xs font-medium text-(--ui-text-secondary)',
    children: [
      jsx('span', { children: formatDay(date) }),
      jsx('span', { 'aria-hidden': 'true', className: 'flex-1', style: { borderTop: '1px solid var(--ui-stroke-tertiary)' } })
    ]
  })
}

// Saved messages group by calendar day. Search results keep Honcho's
// relevance order, so they stay one list with full dates.
function MessageList({ items, peers, grouped = true }) {
  const days = grouped ? groupByDay(items, item => localDay(item.created_at)) : [{ date: null, items }]
  return jsx('div', {
    className: 'min-w-0 space-y-4',
    children: days.map((day, index) => jsxs('section', {
      className: 'min-w-0',
      'aria-label': day.date ? formatDay(day.date) : undefined,
      children: [
        day.date ? jsx(DayHeading, { date: day.date }) : null,
        ...day.items.map(item => jsx(MessageRow, { message: item, peers, dated: !day.date }, item.id))
      ]
    }, `${day.date}|${index}`))
  })
}

function MessagesSection() {
  const layout = useLayout()
  const focus = useFocusScope()
  const snapshot = useHonchoSnapshot()
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState('session')
  const [scopeId, setScopeId] = useState('')
  const [run, setRun] = useState(null)
  const stored = useHonchoEndpoint('/messages', [page, PAGE_SIZE], { page, size: PAGE_SIZE })
  const scopesQuery = useHonchoEndpoint('/scopes', [1, 100], { page: 1, size: 100 }, { retry: 0, staleTime: 60_000 })
  const honchoScopes = scopesQuery.data?.capabilities?.scope_search && scopesQuery.data?.ok ? (scopesQuery.data.items || []) : []
  const scopeOptions = [
    { id: 'session', label: t('this_session') },
    { id: 'peer', label: t('this_user_all_sessions') },
    { id: 'workspace', label: t('whole_workspace') },
    ...(honchoScopes.length ? [{ id: 'honcho', label: t('a_honcho_scope') }] : [])
  ]
  const currentRun = run?.fingerprint === focus.fingerprint ? run : null
  const results = useEndpointForFocus(
    focus,
    '/search',
    currentRun ? [currentRun.scope, currentRun.scopeId || null, currentRun.query, currentRun.limit] : ['idle'],
    currentRun
      ? { scope: currentRun.scope, scope_id: currentRun.scopeId || null, query: currentRun.query, limit: currentRun.limit }
      : { scope, scope_id: scopeId || null, query: 'not-submitted', limit: SEARCH_LIMIT },
    { enabled: Boolean(currentRun), retry: 0, staleTime: 60_000 }
  )
  const peers = { ai: snapshot.data?.config?.ai_peer }

  useEffect(() => setPage(1), [focus.fingerprint])
  useEffect(() => {
    if (run && run.fingerprint !== focus.fingerprint) setRun(null)
  }, [focus.fingerprint, run])
  useEffect(() => {
    if (scope !== 'honcho') return
    if (honchoScopes.length === 0) {
      setScope('session')
      setScopeId('')
      setRun(null)
    } else if (!honchoScopes.some(item => item.id === scopeId)) {
      setScopeId(honchoScopes[0].id)
      setRun(null)
    }
  }, [honchoScopes, scope, scopeId])

  const submit = () => {
    const cleaned = draft.trim()
    if (!cleaned || focus.routeMismatch || results.isFetching || (scope === 'honcho' && !scopeId)) return
    setRun({ fingerprint: focus.fingerprint, query: cleaned, scope, scopeId, limit: SEARCH_LIMIT })
  }
  const clear = () => {
    setDraft('')
    setRun(null)
  }
  const scopeLabel = id => scopeOptions.find(option => option.id === id)?.label || id

  return jsxs('div', {
    className: 'min-w-0 space-y-4',
    // Toolbar and transcript share one edge: speaker gutter plus reading measure.
    style: layout === 'narrow' ? undefined : { maxWidth: `calc(9rem + 16px + ${MESSAGE_MEASURE})` },
    children: [
      jsxs('div', {
        className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
        children: [
          jsx(SearchField, {
            value: draft,
            onChange: value => {
              setDraft(value)
              if (!value) setRun(null)
            },
            onClear: clear,
            onKeyDown: submitOnEnter(submit),
            'aria-label': t('search_messages'),
            placeholder: t('search_messages_and_press_enter'),
            loading: Boolean(currentRun) && results.isFetching,
            containerClassName: 'min-w-48 flex-1 opacity-100',
            inputClassName: 'w-full'
          }),
          jsxs(Select, {
            value: scope,
            onValueChange: next => {
              setScope(next)
              setRun(null)
            },
            children: [
              jsx(SelectTrigger, { 'aria-label': t('search_scope'), className: layout === 'narrow' ? 'w-full' : 'w-52', children: jsx(SelectValue, {}) }),
              jsx(SelectContent, { 'data-honcho-surface': '', children: scopeOptions.map(option => jsx(SelectItem, { value: option.id, children: option.label }, option.id)) })
            ]
          }),
          scope === 'honcho'
            ? jsxs(Select, {
                value: scopeId,
                onValueChange: next => {
                  setScopeId(next)
                  setRun(null)
                },
                children: [
                  jsx(SelectTrigger, { 'aria-label': t('honcho_scope'), className: layout === 'narrow' ? 'w-full' : 'w-48', children: jsx(SelectValue, { placeholder: t('choose_a_scope') }) }),
                  jsx(SelectContent, { 'data-honcho-surface': '', children: honchoScopes.map(item => jsx(SelectItem, { value: item.id, children: text(item.id) }, item.id)) })
                ]
              })
            : null
        ]
      }),
      currentRun
        ? jsx(QueryState, {
            query: results,
            children: jsxs('div', {
              className: 'min-w-0 space-y-2',
              children: [
                jsx(RegionHeading, {
                  meta: `${plural(results.data?.items?.length || 0, 'match', 'matches')} · ${scopeLabel(currentRun.scope)}`,
                  actions: jsx(Button, { variant: 'text', size: 'inline', onClick: clear, children: t('show_saved_messages') }),
                  children: t('results_for', currentRun.query)
                }),
                results.data?.items?.length
                  ? jsx(MessageList, { items: results.data.items, peers, grouped: false })
                  : jsx(Empty, { icon: 'search', title: t('no_matching_messages'), description: results.data?.errors?.[0]?.message || t('try_other_words_or_a_wider_scope_results_keep_honcho_s_relev') })
              ]
            })
          })
        : jsx(QueryState, {
            query: stored,
            children: jsxs('div', {
              className: 'min-w-0 space-y-2',
              children: [
                jsx(RegionHeading, { meta: plural(stored.data?.total || 0, 'message'), children: t('saved_in_this_session') }),
                stored.data?.items?.length
                  ? jsx(MessageList, { items: stored.data.items, peers })
                  : jsx(Empty, { icon: 'comment-discussion', title: t('no_saved_messages_yet'), description: stored.data?.errors?.[0]?.message || t('messages_appear_here_after_hermes_saves_them_to_honcho') }),
                jsx(Pager, { page: stored.data?.page || page, pages: stored.data?.pages, isFetching: stored.isFetching, onPage: setPage })
              ]
            })
          })
    ]
  })
}

// ── Context ─────────────────────────────────────────────────────────────────

function LayerChip({ label, available, detail }) {
  return jsxs('li', {
    className: 'flex min-w-0 items-center gap-1.5 text-xs',
    children: [
      jsx(StatusDot, { tone: available ? 'good' : 'muted' }),
      jsx('span', { className: available ? 'text-foreground' : 'text-(--ui-text-secondary)', children: label }),
      jsx('span', { className: 'text-(--ui-text-tertiary)', children: detail })
    ]
  })
}

function ContextBlock({ title, meta, children }) {
  return jsxs('section', { className: 'min-w-0 space-y-2', children: [jsx(RegionHeading, { meta, children: title }), children] })
}

// Reading copy steps up from the 12px metadata size except in a docked pane.
function readingText(layout) {
  return layout === 'narrow' ? 'text-xs leading-5' : 'text-[13px] leading-5'
}

// Summaries, answers and saved messages are agent-written markdown. They go
// through the host's chat renderer, sized for this surface. media=false: a
// Honcho session can hold turns written on any machine, so MEDIA: paths must
// never resolve against this gateway.
function Markdown({ source, lead = false, measure = '72ch' }) {
  const layout = useLayout()
  const size = layout === 'narrow' ? (lead ? 13 : 12) : (lead ? 14 : 13)
  return jsx('div', {
    ...SELECTABLE,
    className: 'min-w-0 text-foreground',
    style: {
      maxWidth: measure,
      overflowWrap: 'anywhere',
      '--conversation-text-font-size': `${size}px`,
      '--dt-line-height': '1.6',
      '--paragraph-gap': '0.6rem'
    },
    children: jsx(MessageTextContent, { text: text(source, ''), media: false })
  })
}

function ObservationDetails({ details }) {
  if (!details.length) return null
  return jsx('ul', {
    className: 'mt-1 space-y-0.5 text-xs leading-5 text-(--ui-text-secondary)',
    children: details.map((detail, index) => {
      const bullet = detail.match(/^[-*•]\s+([\s\S]*)$/)
      return jsxs('li', {
        className: 'flex min-w-0 gap-1.5',
        children: [
          bullet ? jsx('span', { 'aria-hidden': 'true', className: 'text-(--ui-text-tertiary)', children: '–' }) : null,
          jsx('span', { className: 'min-w-0', children: inlineMarkdown(bullet ? bullet[1] : detail) })
        ]
      }, index)
    })
  })
}

// One calendar day of observations. Times print once per minute so a batch
// Honcho derived together reads as one cluster.
function ObservationDay({ day }) {
  const layout = useLayout()
  let previous = null
  return jsxs('div', {
    className: 'min-w-0',
    children: [
      day.date ? jsx(DayHeading, { date: day.date }) : null,
      jsx('ol', {
        className: 'min-w-0',
        children: day.entries.map((entry, index) => {
          const showTime = Boolean(entry.time) && entry.time !== previous
          previous = entry.time
          return jsxs('li', {
            className: 'grid min-w-0',
            style: { gridTemplateColumns: `${layout === 'narrow' ? '2.75rem' : '3.25rem'} minmax(0, 1fr)`, columnGap: 12, paddingTop: index === 0 ? 0 : showTime ? 8 : 2 },
            children: [
              showTime
                ? jsx('time', { className: 'font-mono text-[11px] leading-5 tabular-nums text-(--ui-text-tertiary)', dateTime: `${entry.date}T${entry.time}`, title: entry.stamp, children: entry.time })
                : jsx('span', { 'aria-hidden': 'true' }),
              jsxs('div', {
                className: cn('min-w-0 text-foreground', readingText(layout)),
                style: PROSE,
                children: [
                  jsxs('p', {
                    children: [
                      entry.label ? jsx('span', { className: 'mr-2 text-[11px] text-(--ui-text-tertiary)', children: entry.label }) : null,
                      inlineMarkdown(entry.text)
                    ]
                  }),
                  jsx(ObservationDetails, { details: entry.details })
                ]
              })
            ]
          }, index)
        })
      })
    ]
  })
}

function ObservationLedger({ sections }) {
  const titled = sections.some(section => section.title)
  return jsx('div', {
    ...SELECTABLE,
    className: 'min-w-0 space-y-6',
    children: sections.map((section, sectionIndex) => {
      const days = []
      for (const entry of section.entries) {
        const last = days[days.length - 1]
        if (last && last.date === entry.date) last.entries.push(entry)
        else days.push({ date: entry.date, entries: [entry] })
      }
      return jsxs('section', {
        className: 'min-w-0 space-y-4',
        'aria-label': sectionTitle(section.title) || undefined,
        children: [
          titled && section.title
            ? jsxs('h3', {
                className: 'flex items-baseline gap-2 text-xs font-medium text-foreground',
                children: [sectionTitle(section.title), jsx('span', { className: 'font-normal tabular-nums text-(--ui-text-tertiary)', children: number(section.entries.length) })]
              })
            : null,
          jsx('div', { className: 'min-w-0 space-y-4', children: days.map((day, dayIndex) => jsx(ObservationDay, { day }, `${day.date}|${dayIndex}`)) })
        ]
      }, sectionIndex)
    })
  })
}

function PeerCardFacts({ facts, emptyText = t('no_peer_card_yet') }) {
  const layout = useLayout()
  const groups = parsePeerCard(facts)
  if (!groups.length) return jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: emptyText })
  const columns = layout === 'narrow' ? '6.5rem minmax(0, 1fr)' : '8.5rem minmax(0, 1fr)'
  return jsx('div', {
    ...SELECTABLE,
    className: 'min-w-0 space-y-4',
    children: groups.map((group, groupIndex) => {
      // Unlabelled facts line up with the values when the group has labels.
      const keyed = group.facts.some(fact => fact.key)
      return jsxs('section', {
        className: 'min-w-0 space-y-1',
        'aria-label': group.label || undefined,
        children: [
          group.label ? jsx('h3', { className: 'text-xs font-medium text-(--ui-text-secondary)', children: group.label }) : null,
          jsx('ul', {
            className: 'min-w-0',
            children: group.facts.map((fact, index) => jsxs('li', {
              className: 'grid min-w-0 py-0.5 text-xs leading-5',
              style: keyed ? { gridTemplateColumns: columns, columnGap: 12 } : undefined,
              children: [
                keyed ? jsx('span', { className: 'text-(--ui-text-tertiary)', style: { overflowWrap: 'anywhere' }, children: fact.key || '' }) : null,
                jsx('span', { className: 'min-w-0 text-foreground', style: PROSE, children: inlineMarkdown(fact.value) })
              ]
            }, index))
          })
        ]
      }, `${group.category}|${groupIndex}`)
    })
  })
}

function ContextSection() {
  const layout = useLayout()
  const wide = layout === 'wide'
  const snapshot = useHonchoSnapshot()
  // Start from what Hermes requests for this profile, so the preview matches
  // the context Hermes receives as closely as the preview's range allows.
  const contextTokens = snapshot.data?.config?.context_tokens
  const capped = Number.isInteger(contextTokens) && contextTokens > 0
  const hermesBudget = contextBudgetFor(contextTokens)
  const budgets = [...new Set([...CONTEXT_BUDGETS, hermesBudget])].sort((a, b) => a - b)
  const [chosen, setChosen] = useState(null)
  const budget = chosen ?? hermesBudget
  const query = useHonchoEndpoint('/context', [budget], { token_budget: budget })
  const data = query.data
  const session = data?.session
  const summaryFloor = session?.summary ? null : summaryBudgetFloor(data?.stored_summaries)
  const largerBudget = summaryFloor ? budgets.find(value => value > summaryFloor && value > budget) : null
  const empty = jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: t('nothing_yet') })
  const sessionRepresentation = data?.session_representation || session?.representation || ''
  const observations = parseRepresentation(sessionRepresentation)
  const observationCount = countObservations(observations)
  // Peer context is the observer's workspace-wide view. Skip it when Honcho
  // returned the same text as the session layer.
  const peerContext = text(data?.peer_context, '').trim() === sessionRepresentation.trim() ? '' : data?.peer_context
  const workspaceObservations = parseRepresentation(peerContext)
  const workspaceCount = countObservations(workspaceObservations)
  const recentMessages = Array.isArray(session?.messages) ? session.messages : []
  const sessionBlocks = data
    ? [
        jsx(ContextBlock, {
          title: t('session_summary'),
          children: session?.summary
            ? jsx(Markdown, { source: session.summary })
            : summaryFloor
              ? jsxs('div', {
                  className: 'space-y-2',
                  children: [
                    jsx('p', {
                      className: 'text-xs leading-5 text-(--ui-text-secondary)',
                      style: PROSE,
                      children: t('summary_needs_budget', number(summaryFloor))
                    }),
                    largerBudget ? jsx(Button, { variant: 'link', size: 'inline', onClick: () => setChosen(largerBudget), children: t('try_n_tokens', number(largerBudget)) }) : null
                  ]
                })
              : empty
        }, 'summary'),
        jsx(ContextBlock, {
          title: t('what_honcho_knows_in_this_session'),
          meta: observationCount ? plural(observationCount, 'observation') : null,
          children: observationCount ? jsx(ObservationLedger, { sections: observations }) : empty
        }, 'representation'),
        recentMessages.length
          ? jsx(ContextBlock, {
              title: t('recent_messages'),
              meta: plural(recentMessages.length, 'message'),
              children: jsx(Disclosure, {
                label: t('show_the_messages_honcho_would_include'),
                indent: false,
                children: () => jsx(MessageList, { items: recentMessages, peers: { ai: snapshot.data?.config?.ai_peer } })
              })
            }, 'messages')
          : null
      ]
    : []
  const workspaceBlocks = data
    ? [
        jsx(ContextBlock, {
          title: t('peer_card'),
          meta: t('whole_workspace'),
          children: jsx(PeerCardFacts, { facts: data.peer_card, emptyText: t('nothing_yet') })
        }, 'card'),
        workspaceCount
          ? jsx(ContextBlock, {
              title: t('what_honcho_knows_across_sessions'),
              meta: plural(workspaceCount, 'observation'),
              children: jsx(ObservationLedger, { sections: workspaceObservations })
            }, 'peer-context')
          : null,
        jsx('p', {
          className: 'text-xs leading-5 text-(--ui-text-tertiary)',
          style: PROSE,
          children: `The token budget limits the session context Honcho assembles. The representation, peer context and peer card are read separately, so the copied total can exceed it. ${text(data.scope_explanation, '')}`
        }, 'scope')
      ]
    : []

  return jsxs('div', {
    className: 'min-w-0 space-y-4',
    style: wide ? undefined : { maxWidth: 880 },
    children: [
      jsxs('div', {
        className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
        children: [
          jsxs(Select, {
            value: String(budget),
            onValueChange: value => setChosen(Number(value)),
            children: [
              jsx(SelectTrigger, { 'aria-label': t('token_budget'), className: layout === 'narrow' ? 'w-full' : 'w-44', children: jsx(SelectValue, {}) }),
              jsx(SelectContent, {
                'data-honcho-surface': '',
                // Only a real Hermes cap is marked. The note below explains
                // the uncapped default.
                children: budgets.map(value => jsx(SelectItem, {
                  value: String(value),
                  children: `${number(value)} tokens${capped && value === hermesBudget ? ' · Hermes' : ''}`
                }, value))
              })
            ]
          }),
          jsxs(Button, { variant: 'secondary', size: 'sm', disabled: query.isFetching || query.routeMismatch, onClick: () => query.refetch(), children: [jsx(icons.RefreshCw, {}), query.isFetching ? t('rebuilding') : t('rebuild')] }),
          data?.copy_text ? jsx(CopyButton, { appearance: 'button', buttonSize: 'sm', buttonVariant: 'ghost', text: data.copy_text, label: t('copy_context'), showLabel: true }) : null
        ]
      }),
      jsx('p', {
        className: 'text-xs leading-5 text-(--ui-text-secondary)',
        style: PROSE,
        children: `${t('rebuilt_just_now')} ${capped
          ? t('asks_up_to_in_profile', plural(contextTokens, t('token')))
          : t('no_limit_uses_default', number(MAX_CONTEXT_BUDGET))}`
      }),
      jsx(QueryState, {
        query,
        children: data
          ? jsxs('div', {
              className: 'min-w-0 space-y-6',
              children: [
                jsxs('ul', {
                  'aria-label': t('context_layers'),
                  className: 'flex min-w-0 flex-wrap gap-x-4 gap-y-1',
                  children: [
                    jsx(LayerChip, { label: t('summary'), available: data.layers?.summaries, detail: session?.summary ? plural(session.summary.length, 'char') : summaryFloor ? 'doesn’t fit' : 'none' }, 'summary'),
                    jsx(LayerChip, { label: t('representation'), available: data.layers?.conclusions, detail: data.session_representation ? plural(data.session_representation.length, 'char') : 'none' }, 'representation'),
                    jsx(LayerChip, { label: t('peer_card'), available: data.layers?.peer_card, detail: plural(data.peer_card?.length || 0, 'fact') }, 'card'),
                    jsx(LayerChip, { label: t('messages'), available: data.layers?.messages, detail: contextMessageDetail(session) }, 'messages'),
                    jsxs('li', {
                      className: 'flex min-w-0 items-center gap-1.5 text-xs tabular-nums',
                      children: [
                        jsx('span', { className: 'text-(--ui-text-secondary)', children: t('copied_total') }),
                        jsx('span', { className: 'text-(--ui-text-tertiary)', children: `about ${plural(data.token_estimate || 0, 'token')} · ${plural(data.character_count || 0, 'char')}` })
                      ]
                    }, 'total')
                  ]
                }),
                // Wide pages split by scope: this session on the left, memory
                // that spans the whole workspace on the right.
                wide
                  ? jsxs('div', {
                      style: { display: 'grid', gap: 40, gridTemplateColumns: 'minmax(0, 38rem) minmax(18rem, 1fr)', alignItems: 'start' },
                      children: [
                        jsx('div', { className: 'flex min-w-0 flex-col', style: { gap: 32 }, children: sessionBlocks }),
                        jsx('aside', {
                          'aria-label': t('workspace_memory'),
                          className: 'min-w-0 space-y-6',
                          style: { borderLeft: '1px solid var(--ui-stroke-tertiary)', paddingLeft: 24 },
                          children: workspaceBlocks
                        })
                      ]
                    })
                  : jsx('div', { className: 'flex min-w-0 flex-col', style: { gap: 32 }, children: [...sessionBlocks, ...workspaceBlocks] })
              ]
            })
          : null
      })
    ]
  })
}

// ── Status ──────────────────────────────────────────────────────────────────

function StatusSection() {
  const layout = useLayout()
  const snapshot = useHonchoSnapshot()
  const data = snapshot.data
  const gate = gateFor(snapshot)
  const activity = useHonchoEndpoint('/activity', [], {}, { poll: true, staleTime: 5_000, enabled: Boolean(data?.ok) })
  const config = data?.config
  const chat = data?.chat
  const queues = activity.data
  const errors = [...(data?.errors || []), ...(queues?.errors || [])]
  const detailCapable = Boolean(queues?.capabilities?.failed_task_detail || queues?.capabilities?.recent_task_detail)
  const routedVia = snapshot.ownerProfile !== snapshot.activeProfile ? snapshot.activeProfile : null

  const summary = gate
    ? jsx(StateLine, { tone: connectionStatus(snapshot).tone === 'bad' ? 'bad' : 'warn', title: gate.title, children: gate.description })
    : data?.ok
      ? jsx(StateLine, {
          tone: errors.length ? 'warn' : 'good',
          title: t('connected_to', text(config?.workspace_id, 'Honcho')),
          children: t('endpoint_latency', text(config?.endpoint), number(data.latency_ms))
        })
      : jsx(LoadingRows, { rows: 2 })

  return jsxs('div', {
    className: 'min-w-0 space-y-5',
    children: [
      summary,
      data
        ? jsxs('div', {
            style: { display: 'grid', gap: 28, gridTemplateColumns: layout === 'wide' ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' },
            children: [
              jsxs(DetailGroup, {
                title: t('this_chat'),
                children: [
                  jsx(DetailRow, { label: t('hermes_state'), value: localState(snapshot) }, 'state'),
                  jsx(DetailRow, { label: t('hermes_chat'), value: chat?.hermes_session_id || t('new_draft'), mono: true }, 'chat'),
                  jsx(DetailRow, { label: t('honcho_session'), value: chat?.honcho_session_id, mono: true, accent: true }, 'session'),
                  jsx(DetailRow, { label: t('saved_in_honcho'), value: chat?.found === true ? 'Yes' : chat?.found === false ? t('not_yet') : t('not_checked') }, 'found'),
                  jsx(DetailRow, { label: t('mapped_by'), value: [config?.session_strategy, chat?.mapping_source].filter(Boolean).join(' · ') || null }, 'mapping'),
                  jsx(DetailRow, { label: t('last_message'), value: chat?.latest_message_at ? `${formatTime(chat.latest_message_at)} · ${text(chat.latest_peer_id)}` : null }, 'latest'),
                  jsx(DetailRow, { label: t('folder'), value: chat?.cwd, mono: true }, 'cwd')
                ]
              }, 'chat'),
              jsxs(DetailGroup, {
                title: t('profile'),
                children: [
                  jsx(DetailRow, { label: t('profile'), value: data.profile, mono: true }, 'profile'),
                  routedVia ? jsx(DetailRow, { label: t('read_through'), value: t('routed_via_active', routedVia), mono: true }, 'via') : null,
                  jsx(DetailRow, { label: t('workspace'), value: config?.workspace_id, mono: true }, 'workspace'),
                  jsx(DetailRow, { label: t('peers'), value: chat?.peers?.join(', ') || null, mono: true }, 'peers'),
                  jsx(DetailRow, { label: t('recall_mode'), value: sentence(config?.recall_mode) }, 'recall'),
                  jsx(DetailRow, { label: t('write_frequency'), value: sentence(config?.write_frequency) }, 'write'),
                  jsx(DetailRow, { label: t('save_messages'), value: config ? (config.save_messages ? 'On' : 'Off') : null }, 'save')
                ]
              }, 'profile'),
              jsxs(DetailGroup, {
                title: t('background_reasoning'),
                note: queues?.capability_note ? `${detailCapable ? '' : t('totals_only')}${queues.capability_note}` : null,
                children: [
                  jsx(DetailRow, { label: t('this_session'), value: queues?.session_queue ? `${queueLabel(queues.session_queue)} · ${queueDetail(queues.session_queue)}` : activity.isLoading ? 'Checking…' : null }, 'session'),
                  jsx(DetailRow, { label: t('workspace'), value: queues?.workspace_queue ? `${queueLabel(queues.workspace_queue)} · ${queueDetail(queues.workspace_queue)}` : activity.isLoading ? 'Checking…' : null }, 'workspace'),
                  jsx(DetailRow, { label: t('sdk'), value: queues?.sdk_version ? `honcho-ai ${queues.sdk_version}` : null, mono: true }, 'sdk')
                ]
              }, 'queues'),
              jsxs('section', {
                className: 'min-w-0 space-y-2',
                children: [jsx(RegionHeading, { children: t('problems') }), jsx(Diagnostics, { errors })]
              }, 'problems')
            ]
          })
        : null
    ]
  })
}

// ── Add to session ──────────────────────────────────────────────────────────

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'log', 'py', 'js', 'jsx', 'ts', 'tsx',
  'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'sh', 'jsonl'
])

function contentTypeForFile(file) {
  const declared = text(file?.type, '').toLowerCase().split(';', 1)[0]
  if (declared === 'application/pdf' || declared === 'application/json' || declared.startsWith('text/')) return declared
  const extension = text(file?.name, '').split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'json') return 'application/json'
  if (TEXT_FILE_EXTENSIONS.has(extension)) return 'text/plain'
  return declared || 'application/octet-stream'
}

function isSupportedUploadType(contentType) {
  return contentType === 'application/pdf' || contentType === 'application/json' || contentType.startsWith('text/')
}

function AddToSessionDialog({ origin, snapshot }) {
  const uploadRequest = useValue($uploadOrigin)
  const open = uploadRequest?.origin === origin
  const focus = useFocusScope()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState('text')
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [focusChanged, setFocusChanged] = useState(false)
  const [retryBlocked, setRetryBlocked] = useState(false)
  const focusFingerprintRef = useRef(focus.fingerprint)
  const openedFingerprintRef = useRef(uploadRequest?.fingerprint || focus.fingerprint)
  const inputId = `honcho-upload-${origin}`
  const uploadInFlightRef = useRef(false)

  focusFingerprintRef.current = focus.fingerprint
  if (open && uploadRequest?.fingerprint) openedFingerprintRef.current = uploadRequest.fingerprint

  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      uploadInFlightRef.current = true
      if (!requestPlugin) throw new Error(t('the_honcho_plugin_backend_is_not_registered'))
      const confirmedFingerprint = openedFingerprintRef.current
      if (focusFingerprintRef.current !== confirmedFingerprint) throw new Error(t('the_focused_chat_changed_reopen_add_to_session_and_confirm_t'))
      const confirmedFocus = { ...focus, backendProfile: snapshot.data?.profile }

      let filename
      let contentType
      let bytes
      let sourceKind
      if (mode === 'text') {
        filename = 'pasted-context.txt'
        contentType = 'text/plain'
        bytes = new TextEncoder().encode(draft).buffer
        sourceKind = 'text'
      } else {
        if (!file) throw new Error(t('choose_a_supported_file_first'))
        filename = file.name
        contentType = contentTypeForFile(file)
        if (!isSupportedUploadType(contentType)) throw new Error(t('honcho_accepts_pdf_json_and_text_files_images_and_other_bina'))
        bytes = await file.arrayBuffer()
        sourceKind = 'file'
      }

      const ticket = await requestForFocus(confirmedFocus, '/upload-ticket', {
        method: 'POST',
        body: { ...focus.body, filename, content_type: contentType, size: bytes.byteLength, source_kind: sourceKind },
        timeoutMs: 22_000
      })
      if (!ticket?.ok || !ticket.ticket) throw new Error(ticket?.errors?.[0]?.message || t('honcho_couldn_t_prepare_this_upload'))
      if (!ticket.target ||
          ticket.target.workspace_id !== snapshot.data?.config?.workspace_id ||
          ticket.target.session_id !== snapshot.data?.chat?.honcho_session_id ||
          ticket.target.peer_id !== snapshot.data?.config?.user_peer) {
        throw new Error(t('the_honcho_target_changed_after_you_confirmed_it_nothing_was'))
      }
      if (focusFingerprintRef.current !== confirmedFingerprint) throw new Error(t('the_focused_chat_changed_before_upload_nothing_was_sent'))

      let uploaded
      try {
        uploaded = await requestForFocus(confirmedFocus, `/uploads/${encodeURIComponent(ticket.ticket)}`, {
          method: 'POST',
          upload: { filename, contentType, bytes },
          timeoutMs: 125_000
        })
      } catch {
        const error = new Error(t('the_upload_response_was_lost_check_this_session_s_messages_b'))
        error.uploadState = 'outcome_unknown'
        error.committed = null
        throw error
      }
      if (focusFingerprintRef.current !== confirmedFingerprint) {
        const error = new Error(t('the_chat_changed_while_honcho_processed_the_upload_the_origi'))
        error.uploadState = 'focus_changed_after_upload'
        throw error
      }
      if (!uploaded?.ok) {
        const error = new Error(uploaded?.errors?.[0]?.message || t('honcho_didn_t_confirm_the_upload'))
        error.uploadState = uploaded?.state
        error.committed = uploaded?.committed
        throw error
      }
      return { ...uploaded, ticket, honcho_default_max_file_size: ticket.capabilities?.honcho_default_max_file_size }
    },
    onSuccess: uploaded => {
      setResult(uploaded)
      queryClient.invalidateQueries({ queryKey: [PLUGIN_ID] })
    },
    onError: error => {
      if (error.uploadState && error.committed !== false) {
        setRetryBlocked(true)
        queryClient.invalidateQueries({ queryKey: [PLUGIN_ID] })
      }
    },
    onSettled: () => {
      uploadInFlightRef.current = false
    }
  })

  useEffect(() => {
    if (open && openedFingerprintRef.current !== focus.fingerprint) setFocusChanged(true)
  }, [focus.fingerprint, open])

  function resetFeedback() {
    if (mutation.isPending || retryBlocked) return
    setResult(null)
    mutation.reset()
  }

  function setOpen(next) {
    if (mutation.isPending || uploadInFlightRef.current) return
    setRetryBlocked(false)
    setResult(null)
    mutation.reset()
    if (next) {
      openedFingerprintRef.current = focus.fingerprint
      setFocusChanged(false)
      $uploadOrigin.set({ origin, fingerprint: focus.fingerprint })
    } else {
      $uploadOrigin.set(null)
      setFile(null)
      setDraft('')
      setFocusChanged(false)
    }
  }

  const contentType = mode === 'file' && file ? contentTypeForFile(file) : 'text/plain'
  const selectedSize = mode === 'file' && file ? file.size : new TextEncoder().encode(draft).byteLength
  const supported = mode === 'text' || !file || isSupportedUploadType(contentType)
  const hasContent = mode === 'text' ? Boolean(draft.trim()) : Boolean(file)
  const targetReady = Boolean(snapshot.data?.ok && snapshot.data?.chat?.found && !focus.routeMismatch)
  const overDefault = selectedSize > HONCHO_DEFAULT_FILE_BYTES
  const locked = mutation.isPending || retryBlocked
  const error = mutation.error
  const errorTitle = error?.uploadState === 'outcome_unknown'
    ? t('outcome_unknown')
    : error?.committed === true || error?.uploadState === 'focus_changed_after_upload'
      ? t('added_but_not_verified')
      : t('not_added')

  return jsx(Dialog, {
    open,
    onOpenChange: setOpen,
    children: jsxs(DialogContent, {
      'data-honcho-surface': '',
      style: DIALOG_STYLE,
      showCloseButton: !mutation.isPending,
      onEscapeKeyDown: event => { if (uploadInFlightRef.current) event.preventDefault() },
      onInteractOutside: event => { if (uploadInFlightRef.current) event.preventDefault() },
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: t('add_to_this_honcho_session') }),
            jsx(DialogDescription, { children: t('honcho_saves_the_text_or_file_as_one_or_more_messages_in_the') })
          ]
        }),
        jsx(TargetList, {
          rows: [
            ['Profile', snapshot.data?.profile || focus.ownerProfile],
            ['Workspace', snapshot.data?.config?.workspace_id],
            ['Session', snapshot.data?.chat?.honcho_session_id],
            [t('attributed_to'), snapshot.data?.config?.user_peer]
          ]
        }),
        jsxs('div', {
          className: 'space-y-3',
          children: [
            jsx(SegmentedControl, {
              value: mode,
              disabled: locked,
              onChange: next => {
                if (locked) return
                setMode(next)
                resetFeedback()
              },
              options: [{ id: 'text', label: t('paste_text') }, { id: 'file', label: t('choose_a_file') }]
            }),
            mode === 'text'
              ? jsx(Textarea, {
                  disabled: locked,
                  value: draft,
                  onChange: event => {
                    setDraft(event.target.value)
                    resetFeedback()
                  },
                  rows: 8,
                  'aria-label': t('text_to_add_to_the_current_honcho_session'),
                  placeholder: t('paste_notes_source_material_or_other_context'),
                  className: 'resize-y'
                })
              : jsxs('div', {
                  className: 'space-y-2',
                  children: [
                    jsx('input', {
                      id: inputId,
                      type: 'file',
                      disabled: locked,
                      accept: '.pdf,.json,.txt,.md,.markdown,.csv,.log,.py,.js,.jsx,.ts,.tsx,.yaml,.yml,.toml,.xml,.html,.css,.sh,.jsonl,application/pdf,application/json,text/*',
                      className: 'sr-only',
                      onChange: event => {
                        setFile(event.target.files?.[0] || null)
                        resetFeedback()
                      }
                    }),
                    jsxs(Button, {
                      variant: 'secondary',
                      size: 'sm',
                      disabled: locked,
                      onClick: () => document.getElementById(inputId)?.click(),
                      children: [jsx(icons.FolderOpen, {}), file ? t('choose_another_file') : t('choose_a_file')]
                    }),
                    file
                      ? jsxs('div', {
                          className: 'min-w-0',
                          children: [
                            jsx('div', { className: 'break-words font-mono text-[11px] text-foreground', children: file.name }),
                            jsx('div', { className: 'mt-0.5 text-xs text-(--ui-text-secondary)', children: `${contentType} · ${formatBytes(file.size)}` })
                          ]
                        })
                      : jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: t('pdf_json_or_text_files_honcho_s_default_limit_is_5_mib_your_') })
                  ]
                }),
            hasContent && mode === 'text'
              ? jsx('div', { className: 'text-xs tabular-nums text-(--ui-text-tertiary)', children: `${plural(draft.length, 'character')} · ${formatBytes(selectedSize)}` })
              : null,
            !supported ? jsx(StateLine, { tone: 'bad', title: t('unsupported_file_type'), children: t('honcho_accepts_pdf_json_and_text_files_choose_another_file') }) : null,
            overDefault
              ? jsx(StateLine, {
                  tone: 'warn',
                  title: t('larger_than_honcho_s_default_limit'),
                  children: t('server_default_limit', formatBytes(HONCHO_DEFAULT_FILE_BYTES))
                })
              : null,
            !targetReady ? jsx(StateLine, { tone: 'warn', title: t('no_saved_session_to_add_to'), children: t('this_needs_a_chat_that_hermes_has_already_saved_to_honcho_in') }) : null,
            focusChanged ? jsx(StateLine, { tone: 'warn', title: t('the_chat_changed'), children: t('close_and_reopen_this_dialog_to_confirm_the_new_target') }) : null,
            error ? jsx(StateLine, { tone: retryBlocked ? 'warn' : 'bad', title: errorTitle, children: error.message }) : null,
            result
              ? jsx(StateLine, {
                  tone: 'good',
                  title: `Added ${plural(result.created_count || 0, 'message')}`,
                  children: jsxs('div', {
                    children: [
                      jsx('p', { children: t('read_back_source', text(result.target?.session_id || result.ticket?.target?.session_id)) }),
                      jsx('div', { className: 'mt-1 break-words font-mono text-[11px] text-(--ui-text-tertiary)', children: result.created?.map(message => message.id).join(' · ') })
                    ]
                  })
                })
              : null
          ]
        }),
        jsxs(DialogFooter, {
          children: [
            jsx(Button, { variant: 'ghost', disabled: mutation.isPending, onClick: () => setOpen(false), children: result || retryBlocked ? 'Close' : 'Cancel' }),
            !result
              ? jsxs(Button, {
                  disabled: locked || !hasContent || !supported || !targetReady || focusChanged,
                  onClick: () => {
                    if (uploadInFlightRef.current) return
                    uploadInFlightRef.current = true
                    mutation.mutate()
                  },
                  children: [jsx(icons.Upload, {}), mutation.isPending ? t('adding') : t('add_to_session')]
                })
              : null
          ]
        })
      ]
    })
  })
}

// ── Page, pane and status bar ───────────────────────────────────────────────

function SectionBody({ snapshot }) {
  const active = useValue($activeTab)
  if (active === 'status') return jsx(StatusSection, {})
  const gate = gateFor(snapshot)
  if (gate) return jsx(GateState, { gate, query: snapshot })
  if (!snapshot.data) return jsx(LoadingRows, {})
  if (active === 'ask') return jsx(AskSection, {})
  if (active === 'messages') return jsx(MessagesSection, {})
  if (active === 'context') return jsx(ContextSection, {})
  return jsx(MemorySection, {})
}

function HonchoPage({ origin = 'page' } = {}) {
  // A router may navigate without a hashchange event. Mounting the page is the
  // reliable signal that the user just opened it.
  useEffect(() => {
    if (origin === 'page') adoptNavigationFocus()
  }, [origin])
  const snapshot = useHonchoSnapshot()
  const active = useValue($activeTab)
  return jsx('main', {
    className: 'h-full overflow-y-auto',
    children: jsx(ResponsiveSurface, {
      // Runtime plugins have no Tailwind build. Keep container geometry explicit.
      className: 'min-h-full font-sans',
      style: { padding: origin === 'pane' ? '12px 16px 24px' : '20px clamp(16px, 4%, 48px) 32px' },
      children: jsxs('div', {
        className: 'flex min-w-0 flex-col',
        style: { gap: 14, maxWidth: 1280, marginInline: 'auto' },
        children: [
          jsx(PageHeader, { query: snapshot, origin }),
          jsx(SectionNav, { origin, snapshot }),
          jsx('section', {
            id: `honcho-${origin}-section`,
            role: 'tabpanel',
            'aria-labelledby': `honcho-${origin}-tab-${active}`,
            className: 'min-w-0 pt-1',
            children: jsx(SectionBody, { snapshot }, snapshot.fingerprint)
          }),
          jsx(AddToSessionDialog, { origin, snapshot })
        ]
      })
    })
  })
}

function HonchoMemoryPane() {
  const visible = useValue(host.paneVisibility(`${PLUGIN_ID}:memory`))
  return visible ? jsx(HonchoPage, { origin: 'pane' }) : null
}

function HonchoStatusChip() {
  const snapshot = useHonchoSnapshot()
  const viewport = useValue(host.state.viewport)
  const compactStatus = viewport?.width < 640
  const data = snapshot.data
  const queue = data?.chat?.queue || data?.queue
  const status = connectionStatus(snapshot)
  let label = `Honcho · ${status.label.toLowerCase()}`
  if (!snapshot.routeMismatch && data?.ok) {
    if (snapshot.busy) label = snapshot.awaitingResponse ? 'Honcho · waiting' : 'Honcho · working'
    else if (queue?.in_progress > 0) label = t('honcho_dot_n_processing', number(queue.in_progress))
    else if (queue?.pending > 0) label = t('honcho_dot_n_waiting', number(queue.pending))
    else label = t('honcho_ready')
  }
  const tip = snapshot.routeMismatch
    ? blockMessage(snapshot.blockReason)
    : data?.ok
      ? `${text(data.profile)} · ${text(data.config?.workspace_id)} · ${queueLabel(queue)}`
      : data?.errors?.[0]?.message || t('open_honcho_memory_for_details')

  return jsx(Tip, {
    label: tip,
    children: jsxs('button', {
      type: 'button',
      'aria-label': label,
      'data-honcho-surface': '',
      onClick: openWorkbench,
      className: 'inline-flex h-full items-center gap-1.5 rounded-none px-1.5 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
      children: [jsx(StatusDot, { tone: status.tone }), compactStatus ? null : jsx('span', { children: label })]
    })
  })
}

export default {
  id: PLUGIN_ID,
  name: 'Honcho',
  description: t('inspect_search_question_and_correct_the_honcho_memory_behind'),
  defaultEnabled: true,
  register(ctx) {
    requestPlugin = ctx.rest
    // The app's language, resolved on every call; bundles are dropped by the
    // loader when this plugin unloads. A host older than the plugin-i18n
    // surface keeps the English default `t`, so nothing renders a bare key.
    if (ctx.i18n) {
      t = ctx.i18n.t
      ctx.i18n.register(COPY)
    }
    installInspectionFocus(ctx)
    ctx.onDispose(() => {
      requestPlugin = null
    })

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: ROUTE },
        render: () => jsx(HonchoPage, {})
      },
      {
        id: 'memory',
        area: PANES_AREA,
        title: 'Honcho Memory',
        data: {
          placement: 'main',
          dock: { pane: 'workspace', pos: 'right', enforce: true },
          defaultCollapsed: true,
          width: '360px'
        },
        render: () => jsx(HonchoMemoryPane, {})
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 55,
        data: { codicon: 'database', label: 'Honcho', path: ROUTE }
      },
      {
        id: 'status',
        area: STATUSBAR_AREAS.right,
        order: 85,
        render: () => jsx(HonchoStatusChip, {})
      },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'honcho.open',
          label: 'Honcho: Open memory',
          keywords: ['honcho', 'memory', 'conclusions', 'session', 'context', 'search'],
          run: openWorkbench
        }
      }
    ])
  }
}
