"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/user-context";
import { canEdit, isSuperAdmin, isEditor as isEditorRole } from "@/lib/utils/role";
import { mockMessages } from "@/lib/data";
import { sanitizeText } from "@/lib/utils/sanitize";
import type { Message, UserRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Send,
  User,
  Shield,
  Megaphone,
  Hash,
} from "lucide-react";

const MESAJLAR_STORAGE_KEY = "mesajlar-messages";

const departmentNames: Record<number, string> = {
  0: "Nikah",
  1: "Nişan",
  2: "Konser",
  3: "Toplantı",
  4: "Özel",
};

type StoredMessage = Omit<Message, "timestamp"> & { timestamp: string };

function loadStoredMessages(): Message[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MESAJLAR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMessage[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
      userName: m.userName || "Kullanıcı",
      userRole: (m.userRole || "Viewer") as UserRole,
    }));
  } catch {
    return null;
  }
}

function saveMessages(messages: Message[]) {
  if (typeof window === "undefined") return;
  try {
    const toStore: StoredMessage[] = messages.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    }));
    localStorage.setItem(MESAJLAR_STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    /* ignore */
  }
}

function formatTime(date: Date) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 1000 / 60);
  const hours = Math.floor(minutes / 60);

  if (minutes < 1) return "Az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  if (hours < 24) return `${hours} saat önce`;
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagesPage() {
  const { user, isEditor } = useUser();
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [newMessage, setNewMessage] = useState("");
  const [activeChannel, setActiveChannel] = useState<"general" | "duyurular">(
    "general"
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasLoadedFromStorage = useRef(false);
  const skipNextPersist = useRef(false);

  const filteredMessages = messages
    .filter((m) => m.channel === activeChannel)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  useEffect(() => {
    const stored = loadStoredMessages();
    if (stored && stored.length > 0) {
      skipNextPersist.current = true;
      setMessages(stored);
    }
    hasLoadedFromStorage.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedFromStorage.current) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    saveMessages(messages);
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !user) return;
    if (activeChannel === "duyurular" && !isEditor) return;

    const displayName =
      (user.name && user.name.trim()) || user.email || "Kullanıcı";
    const displayRole: UserRole =
      user.role === "SuperAdmin" || user.role === "Admin"
        ? "SuperAdmin"
        : user.role === "Editor"
          ? "Editor"
          : user.role === "MerkezSorumlusu"
            ? "MerkezSorumlusu"
            : "Viewer";

    const message: Message = {
      id: Date.now().toString(),
      userId: user.id,
      userName: displayName,
      userRole: displayRole,
      userDepartment: user.department, // Departman bilgisini ekle
      content: newMessage.trim(),
      timestamp: new Date(),
      channel: activeChannel,
    };

    setMessages((prev) => [...prev, message]);
    setNewMessage("");
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredMessages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChannel]);

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* Header */}
      <div className="w-full">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mesajlar</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Ekip ile iletişim kurun ve duyuruları takip edin
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-4">
        {/* Channels Sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Kanallar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-3 pt-0">
            <Button
              variant={activeChannel === "general" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setActiveChannel("general")}
            >
              <Hash className="h-4 w-4" />
              <span>Genel Sohbet</span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {messages.filter((m) => m.channel === "general").length}
              </Badge>
            </Button>
            <Button
              variant={activeChannel === "duyurular" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setActiveChannel("duyurular")}
            >
              <Megaphone className="h-4 w-4" />
              <span>Duyurular</span>
              {!isEditor && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  Sadece Oku
                </Badge>
              )}
            </Button>
          </CardContent>

          {/* Channel Info */}
          <div className="border-t border-border p-4">
            <p className="text-xs text-muted-foreground">
              {activeChannel === "general"
                ? "Tüm personel mesaj gönderebilir ve okuyabilir."
                : "Sadece Editor yetkisi duyuru yayınlayabilir."}
            </p>
          </div>
        </Card>

        {/* Messages Area */}
        <Card className="lg:col-span-3">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-2">
              {activeChannel === "general" ? (
                <Hash className="h-5 w-5 text-primary" />
              ) : (
                <Megaphone className="h-5 w-5 text-primary" />
              )}
              <CardTitle className="text-lg">
                {activeChannel === "general" ? "Genel Sohbet" : "Duyurular"}
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="flex h-[400px] sm:h-[500px] flex-col overflow-hidden p-0">
            {/* Messages List */}
            <ScrollArea className="min-h-0 flex-1 p-3 sm:p-4">
              {filteredMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Henüz mesaj yok
                  </p>
                  <p className="text-xs text-muted-foreground">
                    İlk mesajı siz gönderin!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        user && message.userId === user.id
                          ? "flex-row-reverse"
                          : ""
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          isEditorRole(message.userRole)
                            ? "bg-primary/10"
                            : "bg-muted"
                        }`}
                      >
                        {isEditorRole(message.userRole) ? (
                          <Shield className="h-4 w-4 text-primary" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div
                        className={`max-w-[70%] ${
                          user && message.userId === user.id ? "text-right" : ""
                        }`}
                      >
                        <div
                          className={`flex items-center gap-2 ${
                            user && message.userId === user.id
                              ? "flex-row-reverse"
                              : ""
                          }`}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {message.userName || "Kullanıcı"}
                          </span>
                          <Badge
                            variant={
                              isEditorRole(message.userRole)
                                ? "default"
                                : "outline"
                            }
                            className="text-[10px]"
                          >
                            {isSuperAdmin(message.userRole) 
                              ? "Yönetici" 
                              : isEditorRole(message.userRole) 
                                ? message.userDepartment !== undefined && message.userDepartment !== null && departmentNames[message.userDepartment]
                                  ? `Editör - ${departmentNames[message.userDepartment]}`
                                  : "Editör"
                                : "Viewer"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                        <div
                          className={`mt-1 rounded-lg p-3 ${
                            user && message.userId === user.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm">{sanitizeText(message.content)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t border-border p-3 sm:p-4">
              {activeChannel === "duyurular" && !isEditor ? (
                <div className="rounded-lg bg-muted p-2 sm:p-3 text-center">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Sadece Editor yetkisi duyuru yayınlayabilir
                  </p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder={
                      activeChannel === "general"
                        ? "Mesajınızı yazın..."
                        : "Duyurunuzu yazın..."
                    }
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        newMessage.trim()
                      ) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1 text-sm sm:text-base"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || !user}
                    className="gap-1 sm:gap-2 shrink-0"
                    size="sm"
                  >
                    <Send className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Gönder</span>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
