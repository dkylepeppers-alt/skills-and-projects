// Scene Notes: a sandboxed Browser Extension (Engine 2.5.2+).
// Keeps one private note per chat. Uses only documented APIs: storage, context,
// ui.registerContribution, ui.showWindow and onCleanup. No capabilities are needed,
// because chat IDs are always available; add read_active_characters only if the
// code reads `characters` from the context.

const PANEL_ID = "scene-notes";
let chatId = null;

// Storage calls are async and the user can switch chats while one is pending.
// Every handler captures the chat it started for, writes only that chat's note,
// and skips the panel update if a different chat is open by the time it finishes.
const render = (forChat, note, status) => {
  if (forChat === chatId) panel.update({ elements: elements(note, status) });
};

const notesFor = async (id) => {
  const saved = await marinara.storage.get();
  return (saved.notesByChat ?? {})[id] ?? "";
};

const elements = (note, status) =>
  chatId
    ? [
        { kind: "heading", text: "Notes for this chat" },
        { kind: "input", id: "note", label: "Note", value: note, multiline: true, placeholder: "Plot threads, names, reminders" },
        { kind: "button", id: "save", label: "Save" },
        { kind: "button", id: "clear", label: "Clear" },
        { kind: "text", text: status },
      ]
    : [{ kind: "text", text: "Open a chat to keep notes for it." }];

const panel = marinara.ui.registerContribution({
  id: PANEL_ID,
  kind: "panel",
  label: "Scene Notes",
  description: "Private notes for the open chat",
  icon: "notebook-pen",
  elements: elements("", ""),
  onActivate: async () => {
    const forChat = chatId;
    render(forChat, forChat ? await notesFor(forChat) : "", "");
  },
  onEvent: async ({ elementId, values }) => {
    const forChat = chatId;
    if (!forChat || (elementId !== "save" && elementId !== "clear")) return;
    const saved = await marinara.storage.get();
    const notesByChat = { ...(saved.notesByChat ?? {}) };
    if (elementId === "save") notesByChat[forChat] = String(values.note ?? "");
    else delete notesByChat[forChat];
    await marinara.storage.patch({ notesByChat });
    render(forChat, notesByChat[forChat] ?? "", elementId === "save" ? "Saved." : "Cleared.");
  },
});

const command = marinara.ui.registerContribution({
  id: "open-scene-notes",
  kind: "command",
  label: "Open Scene Notes",
  targetContributionId: PANEL_ID,
});

const unsubscribe = marinara.context.subscribe(async (context) => {
  const forChat = context.chatId;
  chatId = forChat;
  render(forChat, forChat ? await notesFor(forChat) : "", "");
});

marinara.onCleanup(() => {
  unsubscribe();
  command.remove();
  panel.remove();
});
marinara.log.info("Scene Notes loaded");
