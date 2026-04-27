import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../lib/store";
import {
  registerShortcut,
  getAllShortcuts,
  getRecentAccounts,
  addRecentAccount,
  getTransactionTemplates,
} from "../../utils/accessibility";
import "../../styles/accessibility.css";

/**
 * Command Palette Component
 */
function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { connectedAddress, setConnectedAddress, network } = useStore();

  const commands = [
    // Navigation
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      category: "Navigation",
      action: () => navigate("/"),
    },
    {
      id: "nav-account",
      label: "Go to Account",
      category: "Navigation",
      action: () => navigate("/account"),
    },
    {
      id: "nav-transactions",
      label: "Go to Transactions",
      category: "Navigation",
      action: () => navigate("/transactions"),
    },
    {
      id: "nav-contracts",
      label: "Go to Contracts",
      category: "Navigation",
      action: () => navigate("/contracts"),
    },
    {
      id: "nav-assets",
      label: "Go to Asset Discovery",
      category: "Navigation",
      action: () => navigate("/assets"),
    },
    {
      id: "nav-dex",
      label: "Go to DEX Explorer",
      category: "Navigation",
      action: () => navigate("/dex"),
    },

    // Quick Actions
    {
      id: "action-connect",
      label: "Connect Wallet",
      category: "Actions",
      action: () => navigate("/connect"),
    },
    {
      id: "action-builder",
      label: "Open Transaction Builder",
      category: "Actions",
      action: () => navigate("/builder"),
    },
    {
      id: "action-faucet",
      label: "Request Testnet Funds",
      category: "Actions",
      action: () => navigate("/faucet"),
    },

    // Recent Accounts
    ...getRecentAccounts().map((acc) => ({
      id: `account-${acc.publicKey}`,
      label: `Switch to ${acc.publicKey.slice(0, 8)}...${acc.publicKey.slice(-4)}`,
      category: "Recent Accounts",
      action: () => {
        setConnectedAddress(acc.publicKey);
        addRecentAccount(acc.publicKey);
        onClose();
      },
    })),

    // Templates
    ...Object.values(getTransactionTemplates()).map((template) => ({
      id: `template-${template.id}`,
      label: `Load Template: ${template.name}`,
      category: "Templates",
      action: () => {
        navigate("/builder", { state: { template } });
        onClose();
      },
    })),
  ];

  const filteredCommands = query
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.category.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        Math.min(prev + 1, filteredCommands.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.7)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-bright)",
          borderRadius: "var(--radius-lg)",
          width: "90%",
          maxWidth: "600px",
          maxHeight: "70vh",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            style={{
              width: "100%",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              fontSize: "14px",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ maxHeight: "calc(70vh - 80px)", overflowY: "auto" }}>
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div
                style={{
                  padding: "8px 16px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  background: "var(--bg-elevated)",
                }}
              >
                {category}
              </div>
              {cmds.map((cmd, idx) => {
                const globalIndex = filteredCommands.indexOf(cmd);
                return (
                  <div
                    key={cmd.id}
                    onClick={() => {
                      cmd.action();
                      onClose();
                    }}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      background:
                        globalIndex === selectedIndex
                          ? "var(--cyan-dim)"
                          : "transparent",
                      borderLeft:
                        globalIndex === selectedIndex
                          ? "3px solid var(--cyan)"
                          : "3px solid transparent",
                      transition: "var(--transition)",
                    }}
                  >
                    <div
                      style={{ fontSize: "13px", color: "var(--text-primary)" }}
                    >
                      {cmd.label}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              No commands found
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "16px",
            fontSize: "11px",
            color: "var(--text-muted)",
          }}
        >
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Keyboard Shortcuts Help Modal
 */
function ShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: "Ctrl/Cmd + K", description: "Open command palette" },
    { key: "Ctrl/Cmd + /", description: "Show keyboard shortcuts" },
    { key: "G then D", description: "Go to Dashboard" },
    { key: "G then A", description: "Go to Account" },
    { key: "G then T", description: "Go to Transactions" },
    { key: "G then C", description: "Go to Contracts" },
    { key: "Ctrl/Cmd + B", description: "Open Transaction Builder" },
    { key: "Ctrl/Cmd + S", description: "Save current transaction" },
    { key: "Escape", description: "Close modals/dialogs" },
    { key: "?", description: "Show this help" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.7)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-bright)",
          borderRadius: "var(--radius-lg)",
          width: "90%",
          maxWidth: "500px",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "20px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {shortcuts.map((shortcut, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom:
                  idx < shortcuts.length - 1
                    ? "1px solid var(--border)"
                    : "none",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                {shortcut.description}
              </span>
              <kbd
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                }}
              >
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Enhanced Keyboard Navigation with Command Palette and Shortcuts
 */
const KeyboardNavigation = ({ targetId = "main-content" }) => {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const navigate = useNavigate();
  const gKeyPressed = useRef(false);
  const gKeyTimeout = useRef(null);

  useEffect(() => {
    // Command Palette: Ctrl/Cmd + K
    const unregisterCmdK = registerShortcut(
      "meta+k",
      () => {
        setCommandPaletteOpen(true);
      },
      { description: "Open command palette", category: "general" },
    );

    const unregisterCtrlK = registerShortcut(
      "ctrl+k",
      () => {
        setCommandPaletteOpen(true);
      },
      { description: "Open command palette", category: "general" },
    );

    // Shortcuts Help: Ctrl/Cmd + / or ?
    const unregisterHelp1 = registerShortcut(
      "meta+/",
      () => {
        setShortcutsHelpOpen(true);
      },
      { description: "Show shortcuts", category: "general" },
    );

    const unregisterHelp2 = registerShortcut(
      "ctrl+/",
      () => {
        setShortcutsHelpOpen(true);
      },
      { description: "Show shortcuts", category: "general" },
    );

    const unregisterHelp3 = registerShortcut(
      "shift+/",
      () => {
        setShortcutsHelpOpen(true);
      },
      { description: "Show shortcuts", category: "general" },
    );

    // Transaction Builder: Ctrl/Cmd + B
    const unregisterBuilder1 = registerShortcut(
      "meta+b",
      () => {
        navigate("/builder");
      },
      { description: "Open transaction builder", category: "navigation" },
    );

    const unregisterBuilder2 = registerShortcut(
      "ctrl+b",
      () => {
        navigate("/builder");
      },
      { description: "Open transaction builder", category: "navigation" },
    );

    // G + key navigation
    const handleGKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      if (e.key.toLowerCase() === "g") {
        if (gKeyPressed.current) {
          // Double G press - go to top
          window.scrollTo({ top: 0, behavior: "smooth" });
          gKeyPressed.current = false;
          clearTimeout(gKeyTimeout.current);
        } else {
          gKeyPressed.current = true;
          gKeyTimeout.current = setTimeout(() => {
            gKeyPressed.current = false;
          }, 1000);
        }
      } else if (gKeyPressed.current) {
        e.preventDefault();
        const key = e.key.toLowerCase();

        switch (key) {
          case "d":
            navigate("/");
            break;
          case "a":
            navigate("/account");
            break;
          case "t":
            navigate("/transactions");
            break;
          case "c":
            navigate("/contracts");
            break;
          case "x":
            navigate("/dex");
            break;
          case "s":
            navigate("/assets");
            break;
        }

        gKeyPressed.current = false;
        clearTimeout(gKeyTimeout.current);
      }
    };

    document.addEventListener("keydown", handleGKey);

    return () => {
      unregisterCmdK();
      unregisterCtrlK();
      unregisterHelp1();
      unregisterHelp2();
      unregisterHelp3();
      unregisterBuilder1();
      unregisterBuilder2();
      document.removeEventListener("keydown", handleGKey);
      clearTimeout(gKeyTimeout.current);
    };
  }, [navigate]);

  return (
    <>
      <a
        href={`#${targetId}`}
        className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-4 focus:bg-white focus:text-black"
      >
        Skip to main content
      </a>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      <ShortcutsHelp
        isOpen={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
      />
    </>
  );
};

export default KeyboardNavigation;
