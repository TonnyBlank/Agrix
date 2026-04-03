import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export type Conversation = {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message: string | null;
  last_at: string;
  unread_a: number;
  unread_b: number;
  created_at: string;
  other_name?: string;
  other_photo_url?: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read: boolean;
  created_at: string;
};

function normalizeConversationParticipants(userA: string, userB: string) {
  return userA < userB
    ? { participant_a: userA, participant_b: userB }
    : { participant_a: userB, participant_b: userA };
}

async function loadConversationsFromSupabase(userId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .order("last_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Conversation[];
}

async function loadMessagesFromSupabase(userId: string, conversationId: string) {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", conversationId)
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .maybeSingle();

  if (conversationError) throw conversationError;
  if (!conversation) throw new Error("Not a participant");

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const unreadUpdate = conversation.participant_a === userId ? { unread_a: 0 } : { unread_b: 0 };
  await supabase.from("conversations").update(unreadUpdate).eq("id", conversationId);

  return (data ?? []) as Message[];
}

async function loadConversationProfiles(userId: string, conversations: Conversation[]) {
  const otherIds = Array.from(
    new Set(
      conversations.map((conversation) =>
        conversation.participant_a === userId ? conversation.participant_b : conversation.participant_a,
      ),
    ),
  );

  if (!otherIds.length) {
    return new Map<string, { full_name: string | null; photo_url: string | null }>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, photo_url")
    .in("user_id", otherIds);

  if (error) throw error;

  return new Map(
    (data ?? []).map((profile) => [
      profile.user_id,
      {
        full_name: profile.full_name,
        photo_url: profile.photo_url,
      },
    ]),
  );
}

export function useMessages(activeConversationId: string | null) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const conversationsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }
    setLoadingConvs(true);

    try {
      const data = await apiFetch<Conversation[]>("/messages/conversations");
      const profilesByUserId = await loadConversationProfiles(user.id, data);
      const enriched = data.map((conversation) => {
        const otherId =
          conversation.participant_a === user.id
            ? conversation.participant_b
            : conversation.participant_a;
        const profile = profilesByUserId.get(otherId);
        return {
          ...conversation,
          other_name: profile?.full_name || "Unknown",
          other_photo_url: profile?.photo_url || null,
        };
      });

      setConversations(enriched);
    } catch (error) {
      console.error("Failed to load conversations from API, falling back to Supabase", error);
      try {
        const fallbackData = await loadConversationsFromSupabase(user.id);
        const profilesByUserId = await loadConversationProfiles(user.id, fallbackData);
        const enriched = fallbackData.map((conversation) => {
          const otherId =
            conversation.participant_a === user.id
              ? conversation.participant_b
              : conversation.participant_a;
          const profile = profilesByUserId.get(otherId);
          return {
            ...conversation,
            other_name: profile?.full_name || "Unknown",
            other_photo_url: profile?.photo_url || null,
          };
        });

        setConversations(enriched);
      } catch (fallbackError) {
        console.error("Failed to load conversations from Supabase", fallbackError);
        toast.error("Failed to load conversations");
      }
    } finally {
      setLoadingConvs(false);
    }
  }, [user]);

  const loadMessages = useCallback(async () => {
    if (!activeConversationId) {
      setMessages([]);
      setLoadingMsgs(false);
      return;
    }

    setLoadingMsgs(true);
    try {
      const data = await apiFetch<Message[]>(`/messages/conversations/${activeConversationId}`);
      setMessages(data);
    } catch (error) {
      console.error("Failed to load messages from API, falling back to Supabase", error);
      if (!user) {
        toast.error("Failed to load messages");
        return;
      }
      try {
        const fallbackData = await loadMessagesFromSupabase(user.id, activeConversationId);
        setMessages(fallbackData);
      } catch (fallbackError) {
        console.error("Failed to load messages from Supabase", fallbackError);
        toast.error("Failed to load messages");
      }
    } finally {
      setLoadingMsgs(false);
    }
  }, [activeConversationId, user]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!user) return;

    conversationsChannelRef.current = supabase
      .channel(`conversations-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          void loadConversations();
        },
      )
      .subscribe();

    return () => {
      if (conversationsChannelRef.current) {
        void supabase.removeChannel(conversationsChannelRef.current);
      }
    };
  }, [loadConversations, user]);

  useEffect(() => {
    if (!activeConversationId) return;

    channelRef.current = supabase
      .channel(`msgs-${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((item) => item.id === payload.new.id)) {
              return prev;
            }
            return [...prev, payload.new as Message];
          });
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
      }
    };
  }, [activeConversationId]);

  useEffect(() => {
    if (!user || !activeConversationId) return;

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== activeConversationId) return conversation;
        return conversation.participant_a === user.id
          ? { ...conversation, unread_a: 0 }
          : { ...conversation, unread_b: 0 };
      }),
    );
  }, [activeConversationId, user]);

  const sendMessage = async (body: string) => {
    if (!user || !activeConversationId || !body.trim()) return;

    try {
      const message = await apiFetch<Message>(`/messages/conversations/${activeConversationId}/send`, {
        method: "POST",
        body: { body: body.trim() } as unknown as BodyInit,
      });
      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
      await loadConversations();
    } catch (error) {
      console.error("Failed to send message via API, falling back to Supabase", error);
      try {
        const { data: conversation, error: conversationError } = await supabase
          .from("conversations")
          .select("id, participant_a, participant_b, unread_a, unread_b")
          .eq("id", activeConversationId)
          .maybeSingle();

        if (conversationError) throw conversationError;
        if (!conversation || (conversation.participant_a !== user.id && conversation.participant_b !== user.id)) {
          throw new Error("Not a participant");
        }

        const { data: message, error: insertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: activeConversationId,
            sender_id: user.id,
            body: body.trim(),
          })
          .select()
          .single();

        if (insertError) throw insertError;

        const updatePayload =
          conversation.participant_a === user.id
            ? {
                last_message: body.trim(),
                last_at: new Date().toISOString(),
                unread_a: 0,
                unread_b: (conversation.unread_b ?? 0) + 1,
              }
            : {
                last_message: body.trim(),
                last_at: new Date().toISOString(),
                unread_b: 0,
                unread_a: (conversation.unread_a ?? 0) + 1,
              };

        await supabase.from("conversations").update(updatePayload).eq("id", activeConversationId);

        setMessages((prev) => {
          if (prev.some((item) => item.id === message.id)) {
            return prev;
          }
          return [...prev, message as Message];
        });
        await loadConversations();
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : "Failed to send message";
        toast.error(message);
      }
    }
  };

  const startConversation = async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    try {
      const conversation = await apiFetch<{ id: string }>("/messages/conversations", {
        method: "POST",
        body: { other_user_id: otherUserId } as unknown as BodyInit,
      });
      await loadConversations();
      return conversation.id;
    } catch (error) {
      console.error("Failed to start conversation via API, falling back to Supabase", error);
      try {
        const { data: existingRows, error: existingError } = await supabase
          .from("conversations")
          .select("id, created_at")
          .or(
            `and(participant_a.eq.${user.id},participant_b.eq.${otherUserId}),and(participant_a.eq.${otherUserId},participant_b.eq.${user.id})`,
          )
          .order("created_at", { ascending: true })
          .limit(1);

        if (existingError) throw existingError;
        if (existingRows?.length) {
          await loadConversations();
          return existingRows[0].id;
        }

        const normalizedParticipants = normalizeConversationParticipants(user.id, otherUserId);
        const { data: createdConversation, error: createError } = await supabase
          .from("conversations")
          .insert(normalizedParticipants)
          .select()
          .single();

        if (createError) throw createError;

        await loadConversations();
        return createdConversation.id;
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : "Could not start conversation";
        toast.error(message);
        return null;
      }
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (!user) return false;

    try {
      await apiFetch<void>(`/messages/conversations/${conversationId}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
      if (activeConversationId === conversationId) {
        setMessages([]);
      }
      return true;
    } catch (error) {
      console.error("Failed to delete conversation via API, falling back to Supabase", error);
      try {
        const { data: conversation, error: conversationError } = await supabase
          .from("conversations")
          .select("id, participant_a, participant_b")
          .eq("id", conversationId)
          .maybeSingle();

        if (conversationError) throw conversationError;
        if (!conversation || (conversation.participant_a !== user.id && conversation.participant_b !== user.id)) {
          throw new Error("Not a participant");
        }

        const { error: deleteError } = await supabase
          .from("conversations")
          .delete()
          .eq("id", conversationId);

        if (deleteError) throw deleteError;

        setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
        if (activeConversationId === conversationId) {
          setMessages([]);
        }
        return true;
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : "Could not delete conversation";
        toast.error(message);
        return false;
      }
    }
  };

  return {
    conversations,
    messages,
    loadingConvs,
    loadingMsgs,
    sendMessage,
    startConversation,
    deleteConversation,
    refetch: loadConversations,
  };
}
