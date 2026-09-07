import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import type { FormEvent } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  deleteDoc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Archive,
  ArrowLeft,
  Bell,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Image,
  LogOut,
  Menu,
  Mic,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Search,
  Send,
  Settings,
  Smile,
  Sparkles,
  UserRound,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import "./App.css";
import "./call.css";
import "./chat-layout.css";
import "./auth.css";
import "./mobile.css";
import "./profile-image.css";
import "./search.css";
import "./data-status.css";
import "./sections.css";
import "./message-size.css";
import "./verification.css";
import "./verification-choice.css";
import { auth, db } from "./lib/firebase";

const verificationActionCodeSettings = {
  url: `${window.location.origin}/?verification=complete`,
  handleCodeInApp: false,
};

const sendVerificationEmail = (user: User) =>
  sendEmailVerification(user, verificationActionCodeSettings);

type Conversation = {
  id: string;
  memberIds: string[];
  name: string;
  handle: string;
  avatar: string;
  color: string;
  photoUrl?: string;
  lastMessage: string;
  time: string;
  unread?: number;
  online?: boolean;
  kind?: "group";
  archivedBy?: string[];
  deletedBy?: string[];
  messageRequestStatus?: "pending" | "accepted";
  messageRequestTo?: string;
  clearedAt?: number;
  updatedAt?: number;
};

type ChatMessage = {
  id: string;
  mine: boolean;
  text: string;
  time: string;
  image?: string;
  type?: "text" | "image" | "call";
  callMode?: "voice" | "video";
  durationSeconds?: number;
  senderId?: string;
};

type UserProfile = {
  username: string;
  firstName: string;
  lastName: string;
  age: number;
  photoUrl?: string;
  emailVerified?: boolean;
};
type Person = UserProfile & {
  id: string;
  name: string;
  handle: string;
  meta: string;
  avatar: string;
  color: string;
};

function Avatar({
  initials,
  color,
  size = "medium",
  photoUrl,
}: {
  initials: string;
  color: string;
  size?: "small" | "medium" | "large";
  photoUrl?: string;
}) {
  return (
    <div
      className={`avatar avatar-${size} avatar-${color} ${photoUrl ? "avatar-with-image" : ""}`}
      style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
    >
      {!photoUrl && initials}
    </div>
  );
}

function compressImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new window.Image();
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas
          .getContext("2d")
          ?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.onerror = reject;
      image.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const formatCallDuration = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
const copyrightYear = new Date().getFullYear();

function Workspace({ user, profile }: { user: User; profile: UserProfile }) {
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [activeId, setActiveId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null);
  const [callMode, setCallMode] = useState<"voice" | "video" | null>(null);
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "connected">("idle");
  const [callError, setCallError] = useState("");
  const [callElapsed, setCallElapsed] = useState(0);
  const [incomingCall, setIncomingCall] = useState<{ id: string; conversationId: string; mode: "voice" | "video"; callerName: string; callerPhotoUrl?: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [mediaReady, setMediaReady] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showContactProfile, setShowContactProfile] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [dataError, setDataError] = useState("");
  const [activeSection, setActiveSection] = useState<
    "messages" | "notifications" | "archived"
  >("messages");
  const [notifications, setNotifications] = useState<
    {
      id: string;
      text: string;
      createdAt?: { toDate?: () => Date };
      read?: boolean;
    }[]
  >([]);
  const imageInput = useRef<HTMLInputElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const callId = useRef("");
  const callStartedAt = useRef<number | null>(null);
  const callListener = useRef<(() => void) | null>(null);
  const candidateListener = useRef<(() => void) | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagePressTimer = useRef<number | null>(null);
  const conversationPressTimer = useRef<number | null>(null);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId,
  );
  const isMessageRequestPending = activeConversation?.messageRequestStatus === "pending" && activeConversation.messageRequestTo === user.uid;
  const filteredPeople = useMemo(
    () =>
      people.filter((person) =>
        `${person.name} ${person.handle}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [people, search],
  );
  const visibleConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        const archived = conversation.archivedBy?.includes(user.uid) ?? false;
        const deleted = conversation.deletedBy?.includes(user.uid) ?? false;
        const matchesSearch =
          `${conversation.name} ${conversation.handle} ${conversation.lastMessage}`
            .toLowerCase()
            .includes(search.toLowerCase());
        return activeSection === "archived"
          ? archived && !deleted && matchesSearch
          : !archived && !deleted && matchesSearch;
      }),
    [activeSection, conversations, search, user.uid],
  );

  const openPerson = async (person: Person) => {
    const conversationId = [user.uid, person.id].sort().join("_");
    await setDoc(
      doc(db, "conversations", conversationId),
      {
        memberIds: [user.uid, person.id],
        memberNames: {
          [user.uid]: `${profile.firstName} ${profile.lastName}`,
          [person.id]: person.name,
        },
        memberHandles: {
          [user.uid]: `@${profile.username}`,
          [person.id]: person.handle,
        },
        memberAvatars: {
          [user.uid]: `${currentProfile.firstName[0]}${currentProfile.lastName[0]}`,
          [person.id]: person.avatar,
        },
        memberPhotoUrls: {
          [user.uid]: currentProfile.photoUrl ?? "",
          [person.id]: person.photoUrl ?? "",
        },
        memberColors: { [user.uid]: "plum", [person.id]: person.color },
        lastMessage: "Start a conversation",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setActiveId(conversationId);
    setSearch("");
  };

  useEffect(() => {
    const conversationQuery = query(
      collection(db, "conversations"),
      where("memberIds", "array-contains", user.uid),
      limit(100),
    );
    return onSnapshot(
      conversationQuery,
      (snapshot) => {
        setDataError("");
        setConversations(
          snapshot.docs
            .map((item) => {
              const data = item.data();
              const otherId =
                (data.memberIds as string[]).find((id) => id !== user.uid) ??
                user.uid;
              return {
                id: item.id,
                memberIds: (data.memberIds as string[]) ?? [],
                name: data.memberNames?.[otherId] ?? "Conversation",
                handle: data.memberHandles?.[otherId] ?? "",
                avatar: data.memberAvatars?.[otherId] ?? "?",
                color: data.memberColors?.[otherId] ?? "plum",
                photoUrl: data.memberPhotoUrls?.[otherId] ?? people.find((person) => person.id === otherId)?.photoUrl,
                lastMessage: data.lastMessage ?? "Start a conversation",
                time:
                  data.lastMessageAt
                    ?.toDate?.()
                    .toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    }) ?? "",
                online: false,
                archivedBy: data.archivedBy ?? [],
                deletedBy: data.deletedBy ?? [],
                messageRequestStatus: data.messageRequestStatus,
                messageRequestTo: data.messageRequestTo,
                clearedAt: data.clearedAtBy?.[user.uid]?.toMillis?.() ?? 0,
                updatedAt: data.updatedAt?.toMillis?.() ?? 0,
              };
            })
            .sort((left, right) => right.updatedAt - left.updatedAt),
        );
      },
      () => setDataError("Unable to load your inbox right now."),
    );
  }, [people, user.uid]);

  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "notifications"),
          where("userId", "==", user.uid),
          limit(50),
        ),
        (snapshot) =>
          setNotifications(
            snapshot.docs.map((item) => ({
              id: item.id,
              ...(item.data() as {
                text: string;
                createdAt?: { toDate?: () => Date };
                read?: boolean;
              }),
            })),
          ),
        () => setDataError("Unable to load notifications right now."),
      ),
    [user.uid],
  );

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "users"), limit(100)),
        (snapshot) =>
          setPeople(
            snapshot.docs
              .filter((item) => item.id !== user.uid)
              .map((item) => {
                const data = item.data() as UserProfile;
                return {
                  ...data,
                  id: item.id,
                  name: `${data.firstName} ${data.lastName}`,
                  handle: `@${data.username}`,
                  meta: "CFAM member",
                  avatar: `${data.firstName?.[0] ?? ""}${data.lastName?.[0] ?? ""}`,
                  color: "plum",
                };
              }),
          ),
        (error) =>
          setDataError(
            error.code === "permission-denied"
              ? "People search is unavailable. Check your Firestore rules."
              : "Unable to load people right now.",
          ),
      ),
    [user.uid],
  );

  useEffect(() => {
    if (!activeId) return;
    return onSnapshot(
      query(
        collection(db, "conversations", activeId, "messages"),
        orderBy("createdAt", "asc"),
        limit(200),
      ),
      (snapshot) =>
          setMessages(
          snapshot.docs.filter((item) => {
            const createdAt = item.data().createdAt?.toMillis?.() ?? 0;
            return !activeConversation?.clearedAt || createdAt > activeConversation.clearedAt;
          }).map((item) => {
            const data = item.data();
            return {
              id: item.id,
              mine: data.senderId === user.uid,
              text: data.text ?? "",
              type: data.type,
              callMode: data.callMode,
              durationSeconds: data.durationSeconds,
              senderId: data.senderId,
              time:
                data.createdAt
                  ?.toDate?.()
                  .toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  }) ?? "Now",
              image: data.imageBase64,
            };
          }),
        ),
      (error) =>
        setDataError(
          error.code === "permission-denied"
            ? "You are not a member of this conversation."
            : "Unable to load messages right now.",
        ),
    );
  }, [activeConversation?.clearedAt, activeId, user.uid]);

  useEffect(() => {
    setSelectedMessageIds([]);
    setMessageMenuId(null);
  }, [activeId]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!activeId || !messages.length) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeId, messages.length]);

  const sendMessage = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (!activeId) return;
    if (activeConversation?.messageRequestStatus === "pending" && activeConversation.messageRequestTo === user.uid) return;
    void addDoc(collection(db, "conversations", activeId, "messages"), {
      senderId: user.uid,
      text: trimmed,
      type: "text",
      createdAt: serverTimestamp(),
    });
    if (activeConversation && !messages.length && activeConversation.messageRequestStatus !== "accepted") {
      const recipientId = activeConversation.memberIds.find((memberId) => memberId !== user.uid);
      void updateDoc(doc(db, "conversations", activeId), { messageRequestStatus: "pending", messageRequestTo: recipientId });
    }
    void updateDoc(doc(db, "conversations", activeId), {
      lastMessage: trimmed,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setMessage("");
  };

  const sendImage = async (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const image = await compressImage(file);
    if (!activeId) return;
    if (activeConversation?.messageRequestStatus === "pending" && activeConversation.messageRequestTo === user.uid) return;
    void addDoc(collection(db, "conversations", activeId, "messages"), {
      senderId: user.uid,
      text: "",
      type: "image",
      imageBase64: image,
      createdAt: serverTimestamp(),
    });
    if (activeConversation && !messages.length && activeConversation.messageRequestStatus !== "accepted") {
      const recipientId = activeConversation.memberIds.find((memberId) => memberId !== user.uid);
      void updateDoc(doc(db, "conversations", activeId), { messageRequestStatus: "pending", messageRequestTo: recipientId });
    }
    void updateDoc(doc(db, "conversations", activeId), {
      lastMessage: "Image",
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const archiveConversation = async (conversation: Conversation) => {
    await updateDoc(doc(db, "conversations", conversation.id), {
      archivedBy: conversation.archivedBy?.includes(user.uid)
        ? arrayRemove(user.uid)
        : arrayUnion(user.uid),
    });
      setConversationMenuId(null);
  };

  const acceptMessageRequest = async () => {
    if (!activeConversation) return;
    await updateDoc(doc(db, "conversations", activeConversation.id), { messageRequestStatus: "accepted", messageRequestTo: null });
  };

  const unsendMessage = async (messageId: string) => {
    if (!activeId) return;
    await deleteDoc(doc(db, "conversations", activeId, "messages", messageId));
    setMessageMenuId(null);
  };

  const deleteSelectedMessages = async () => {
    if (!activeId) return;
    const deletions = selectedMessageIds
      .filter((messageId) => messages.find((item) => item.id === messageId)?.mine)
      .map((messageId) => deleteDoc(doc(db, "conversations", activeId, "messages", messageId)));
    await Promise.all(deletions);
    setSelectedMessageIds([]);
  };

  const clearChat = async (conversation: Conversation) => {
    await updateDoc(doc(db, "conversations", conversation.id), {
      [`clearedAtBy.${user.uid}`]: serverTimestamp(),
      lastMessage: "Chat cleared",
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setConversationMenuId(null);
  };

  const deleteChat = async (conversation: Conversation) => {
    await updateDoc(doc(db, "conversations", conversation.id), { deletedBy: arrayUnion(user.uid) });
    if (activeId === conversation.id) {
      setActiveId("");
      setMessages([]);
    }
    setConversationMenuId(null);
  };

  const stopCallMedia = () => {
    callListener.current?.();
    candidateListener.current?.();
    callListener.current = null;
    candidateListener.current = null;
    peerConnection.current?.close();
    peerConnection.current = null;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    remoteStream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
  };

  const playRemoteAudio = () => {
    if (!remoteAudio.current || !remoteStream.current) return;
    remoteAudio.current.srcObject = remoteStream.current;
    void remoteAudio.current.play().catch(() => undefined);
  };

  const playRemoteVideo = () => {
    if (!remoteVideo.current || !remoteStream.current) return;
    if (!remoteVideo.current.srcObject) remoteVideo.current.srcObject = remoteStream.current;
    remoteVideo.current.muted = true;
    void remoteVideo.current.play().catch(() => undefined);
  };

  const recordCall = async (callDocumentId: string, duration: number) => {
    const callReference = doc(db, "calls", callDocumentId);
    let shouldRecord = false;
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(callReference);
      if (snapshot.exists() && !snapshot.data().historyWritten) {
        transaction.update(callReference, { historyWritten: true, status: "ended", endedAt: serverTimestamp() });
        shouldRecord = true;
      }
    });
    if (!shouldRecord) return;
    const callData = (await getDoc(callReference)).data();
    if (!callData?.conversationId) return;
    const mode = callData.mode === "video" ? "video" : "voice";
    const text = mode === "video" ? "Video call" : "Voice call";
    await addDoc(collection(db, "conversations", callData.conversationId, "messages"), {
      senderId: user.uid,
      text,
      type: "call",
      callMode: mode,
      durationSeconds: duration,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "conversations", callData.conversationId), {
      lastMessage: `${text} · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const listenForCallChanges = (id: string, caller: boolean) => {
    callListener.current?.();
    callListener.current = onSnapshot(doc(db, "calls", id), (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      if (caller && data.answer && peerConnection.current?.signalingState === "have-local-offer") {
        void peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        setCallStatus("connected");
        callStartedAt.current ??= Date.now();
      }
      if (data.status === "ended") {
        stopCallMedia();
        setCallMode(null);
        setCallStatus("idle");
      }
    });
  };

  const createPeerConnection = async (id: string, mode: "voice" | "video") => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
    localStream.current = stream;
    stream.getAudioTracks().forEach((track) => { track.enabled = true; });
    setMediaReady((current) => current + 1);
    if (localVideo.current) localVideo.current.srcObject = stream;
    remoteStream.current = new MediaStream();
    playRemoteVideo();
    playRemoteAudio();
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnection.current = connection;
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    connection.ontrack = (event) => {
      if (event.track.kind === "video") {
        const videoStream = new MediaStream([event.track]);
        if (remoteVideo.current) {
          remoteVideo.current.srcObject = videoStream;
          remoteVideo.current.muted = true;
          remoteVideo.current.load();
          void remoteVideo.current.play().catch(() => undefined);
        }
      } else if (remoteStream.current && !remoteStream.current.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.current.addTrack(event.track);
      }
      playRemoteAudio();
    };
    connection.onicecandidate = (event) => {
      if (event.candidate) void addDoc(collection(db, "calls", id, "candidates"), { senderId: user.uid, candidate: event.candidate.toJSON(), createdAt: serverTimestamp() });
    };
    candidateListener.current = onSnapshot(collection(db, "calls", id, "candidates"), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === "added" && data.senderId !== user.uid && data.candidate) void connection.addIceCandidate(new RTCIceCandidate(data.candidate));
      });
    });
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") setCallStatus("connected");
      if (["failed", "disconnected"].includes(connection.connectionState)) setCallError("The call connection was lost.");
    };
    return connection;
  };

  const startCall = async (mode: "voice" | "video") => {
    if (!activeConversation) return;
    setCallError("");
    setCallMode(mode);
    setCallStatus("calling");
    setCallElapsed(0);
    callStartedAt.current = null;
    try {
      const callReference = doc(collection(db, "calls"));
      callId.current = callReference.id;
      const connection = await createPeerConnection(callReference.id, mode);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await setDoc(callReference, {
        conversationId: activeConversation.id,
        callerId: user.uid,
        receiverId: activeConversation.memberIds.find((memberId) => memberId !== user.uid),
        participantIds: activeConversation.memberIds,
        callerName: `${currentProfile.firstName} ${currentProfile.lastName}`,
        callerPhotoUrl: currentProfile.photoUrl ?? "",
        mode,
        offer: { type: offer.type, sdp: offer.sdp },
        status: "ringing",
        historyWritten: false,
        createdAt: serverTimestamp(),
      });
      listenForCallChanges(callReference.id, true);
    } catch (callStartError) {
      stopCallMedia();
      callId.current = "";
      setCallMode(null);
      setCallStatus("idle");
      setCallError(callStartError instanceof Error ? callStartError.message : "Unable to start the call.");
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    const callReference = doc(db, "calls", incomingCall.id);
    try {
      const snapshot = await getDoc(callReference);
      const data = snapshot.data();
      if (!data?.offer) return;
      setCallMode(incomingCall.mode);
      setActiveId(incomingCall.conversationId);
      setCallStatus("connected");
      setCallElapsed(0);
      callId.current = incomingCall.id;
      callStartedAt.current = Date.now();
      const connection = await createPeerConnection(incomingCall.id, incomingCall.mode);
      await connection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await updateDoc(callReference, { answer: { type: answer.type, sdp: answer.sdp }, status: "accepted" });
      setIncomingCall(null);
    } catch (callErrorValue) {
      setCallError(callErrorValue instanceof Error ? callErrorValue.message : "Unable to accept the call.");
    }
  };

  const endCall = async () => {
    const id = callId.current;
    const duration = callStartedAt.current ? Math.max(0, Math.round((Date.now() - callStartedAt.current) / 1000)) : 0;
    stopCallMedia();
    setCallMode(null);
    setCallStatus("idle");
    if (id) {
      try {
        await updateDoc(doc(db, "calls", id), { status: "ended", endedAt: serverTimestamp() });
        await recordCall(id, duration);
      } catch (recordError) { setCallError(recordError instanceof Error ? recordError.message : "Unable to record the call."); }
      callId.current = "";
    }
  };

  useEffect(() => {
    const incomingQuery = query(collection(db, "calls"), where("participantIds", "array-contains", user.uid), where("status", "==", "ringing"), limit(10));
    return onSnapshot(incomingQuery, (snapshot) => {
      const call = snapshot.docs.find((item) => item.data().callerId !== user.uid);
      if (!call || callMode || callId.current) {
        setIncomingCall(null);
        return;
      }
      setIncomingCall({ id: call.id, conversationId: call.data().conversationId, mode: call.data().mode === "video" ? "video" : "voice", callerName: call.data().callerName ?? "CFAM member", callerPhotoUrl: call.data().callerPhotoUrl });
    });
  }, [callMode, user.uid]);

  useEffect(() => () => stopCallMedia(), []);

  useEffect(() => {
    if (callStatus !== "connected" || !callStartedAt.current) return undefined;
    const updateElapsed = () => setCallElapsed(Math.max(0, Math.floor((Date.now() - callStartedAt.current!) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [callStatus]);

  useEffect(() => {
    if (localVideo.current && localStream.current) localVideo.current.srcObject = localStream.current;
    playRemoteVideo();
    playRemoteAudio();
  }, [callMode, mediaReady]);

  return (
    <main
      className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""} ${detailsOpen ? "details-is-open" : ""} ${mobileChatOpen ? "mobile-chat-open" : ""}`}
    >
      <aside
        className={`sidebar ${showMobileNav ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <div className="brand-row">
          <div className="brand-mark">C</div>
          <span>CFAM</span>
          <button
            className="icon-button sidebar-toggle mobile-close"
            onClick={() => setShowMobileNav(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
          <button
            className="icon-button sidebar-toggle desktop-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label="Collapse sidebar"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>
        </div>
        <div
          className="profile-mini"
          onClick={() => setShowProfile(true)}
          role="button"
          tabIndex={0}
        >
          <Avatar
            initials={`${currentProfile.firstName[0]}${currentProfile.lastName[0]}`}
            color="plum"
            size="small"
            photoUrl={currentProfile.photoUrl}
          />
          <span>
            <strong>
              {currentProfile.firstName} {currentProfile.lastName}
            </strong>
            <small>@{currentProfile.username}</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav">
          <p className="nav-label">Workspace</p>
          <button
            className={`nav-item ${activeSection === "messages" ? "active" : ""}`}
            onClick={() => setActiveSection("messages")}
          >
            <UsersRound size={18} /> Messages{" "}
            <span className="nav-count">
              {
                conversations.filter(
                  (conversation) =>
                    !conversation.archivedBy?.includes(user.uid),
                ).length
              }
            </span>
          </button>
          <button
            className={`nav-item ${activeSection === "notifications" ? "active" : ""}`}
            onClick={() => setActiveSection("notifications")}
          >
            <Bell size={18} /> Notifications{" "}
            {notifications.some((notification) => !notification.read) && (
              <span className="nav-dot" />
            )}
          </button>
          <button
            className={`nav-item ${activeSection === "archived" ? "active" : ""}`}
            onClick={() => setActiveSection("archived")}
          >
            <Archive size={18} /> Archived{" "}
            <span className="nav-count">
              {
                conversations.filter((conversation) =>
                  conversation.archivedBy?.includes(user.uid),
                ).length
              }
            </span>
          </button>
          <p className="nav-label nav-label-spaced">Manage</p>
          <button className="nav-item">
            <Settings size={18} /> Settings
          </button>
          <button className="nav-item">
            <CircleHelp size={18} /> Help center
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-top">
              <Sparkles size={15} />
              <span>Personal space</span>
            </div>
            <p>Make conversations feel more like you.</p>
            <button onClick={() => setShowProfile(true)}>
              Edit your profile <ArrowLeft size={15} />
            </button>
          </div>
          <button className="logout-button" onClick={() => void signOut(auth)}>
            <LogOut size={17} /> Sign out
          </button>
          <small className="version">
            CFAM (Connect Family) by Amin<br />
            Copyright by Amin Nepali {copyrightYear}
          </small>
        </div>
      </aside>

      <section className="conversation-panel">
        <header className="panel-header">
          <button
            className="icon-button mobile-menu"
            onClick={() => setShowMobileNav(true)}
            aria-label="Open menu"
          >
            <Menu size={21} />
          </button>
          <div>
            <p className="eyebrow">Your inbox</p>
            <h1>
              {activeSection === "notifications"
                ? "Notifications"
                : activeSection === "archived"
                  ? "Archived"
                  : "Messages"}
            </h1>
          </div>
          {activeSection === "messages" && (
            <button className="new-message" aria-label="Start a new message">
              + <span>New message</span>
            </button>
          )}
        </header>
        <div className="conversation-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations or people"
            aria-label="Search conversations or people"
          />
          <button
            className="search-clear"
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        </div>
        <div className="conversation-list">
          {dataError && <p className="data-error">{dataError}</p>}
          {activeSection === "notifications" ? (
            <div className="notification-list">
              {notifications.length === 0 ? (
                <p className="empty-search">No notifications yet.</p>
              ) : (
                notifications.map((notification) => (
                  <div
                    className={`notification-row ${notification.read ? "" : "unread"}`}
                    key={notification.id}
                  >
                    <Bell size={16} />
                    <span>
                      <strong>{notification.text}</strong>
                      <small>
                        {notification.createdAt?.toDate?.()?.toLocaleString() ??
                          "Just now"}
                      </small>
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="list-title">
                <span>
                  {activeSection === "archived"
                    ? "Archived conversations"
                    : search
                      ? "Search results"
                      : "Recent · live"}
                </span>
                <button className="filter-button">
                  All <ChevronDown size={14} />
                </button>
              </div>
              {visibleConversations.map((conversation) => (
                <div className="conversation-entry" key={conversation.id}>
                  <button
                    className={`conversation-row ${activeId === conversation.id ? "selected" : ""}`}
                    onPointerDown={() => {
                      conversationPressTimer.current = window.setTimeout(() => setConversationMenuId(conversation.id), 550);
                    }}
                    onPointerUp={() => { if (conversationPressTimer.current) window.clearTimeout(conversationPressTimer.current); }}
                    onPointerCancel={() => { if (conversationPressTimer.current) window.clearTimeout(conversationPressTimer.current); }}
                    onContextMenu={(event) => { event.preventDefault(); setConversationMenuId(conversation.id); }}
                    onClick={() => {
                      if (conversationMenuId === conversation.id) return;
                      setActiveId(conversation.id);
                      setMobileChatOpen(true);
                      setShowMobileNav(false);
                    }}
                  >
                    <Avatar
                      initials={conversation.avatar}
                      color={conversation.color}
                      photoUrl={conversation.photoUrl}
                    />
                    <span className="conversation-copy">
                      <strong>{conversation.name}</strong>
                      <small>{conversation.lastMessage}</small>
                    </span>
                    <span className="conversation-meta">
                      <small>{conversation.time}</small>
                    </span>
                  </button>
                  {conversationMenuId === conversation.id ? (
                    <div className="conversation-menu">
                      <button onClick={() => void archiveConversation(conversation)}>{activeSection === "archived" ? "Restore" : "Archive"}</button>
                      <button onClick={() => void clearChat(conversation)}>Clear chat</button>
                      <button onClick={() => void deleteChat(conversation)}>Delete chat</button>
                    </div>
                  ) : (
                    <button className="archive-action" onClick={() => void archiveConversation(conversation)} aria-label={activeSection === "archived" ? "Restore conversation" : "Archive conversation"}>
                      {activeSection === "archived" ? "Restore" : "Archive"}
                    </button>
                  )}
                </div>
              ))}
              {activeSection === "messages" &&
                search &&
                filteredPeople.length > 0 && (
                  <div className="inline-people">
                    <p className="inline-results-label">People</p>
                    {filteredPeople.map((person) => (
                      <button
                        key={person.handle}
                        className="person-result"
                        onClick={() => {
                          void openPerson(person);
                        }}
                      >
                        <Avatar
                          initials={person.avatar}
                          color={person.color}
                          size="small"
                          photoUrl={person.photoUrl}
                        />
                        <span>
                          <strong>{person.name}</strong>
                          <small>
                            {person.handle} · {person.meta}
                          </small>
                        </span>
                        <ArrowLeft size={16} />
                      </button>
                    ))}
                  </div>
                )}
              {search &&
                visibleConversations.length === 0 &&
                filteredPeople.length === 0 && (
                  <p className="empty-search">
                    No conversations or people found for “{search}”.
                  </p>
                )}
            </>
          )}
        </div>
        <div className="discover-card">
          <div className="discover-icon">
            <Search size={18} />
          </div>
          <div>
            <strong>Find your people</strong>
            <p>Search by username to start a new conversation.</p>
          </div>
          <ArrowLeft size={17} className="discover-arrow" />
        </div>
      </section>

      <section className="chat-panel">
        <header className="chat-header">
          <button
            className="icon-button mobile-back"
            onClick={() => setMobileChatOpen(false)}
            aria-label="Back to conversations"
          >
            <ArrowLeft size={21} />
          </button>
          <button
            className="icon-button mobile-menu"
            onClick={() => setShowMobileNav(true)}
            aria-label="Open menu"
          >
            <Menu size={21} />
          </button>
          {activeConversation ? (
            <>
              <button
                className="chat-person chat-person-button"
                onClick={() => setDetailsOpen((current) => !current)}
                aria-label="Toggle contact details"
              >
                <Avatar
                  initials={activeConversation.avatar}
                  color={activeConversation.color}
                  photoUrl={activeConversation.photoUrl}
                />
                <div>
                  <h2>{activeConversation.name}</h2>
                  <p>
                    <span
                      className={`online-dot ${isOnline ? "" : "offline-dot"}`}
                    />{" "}
                    {isOnline ? "Online" : "Offline"}
                  </p>
                </div>
              </button>
              <div className="chat-actions">
                <button
                  className="icon-button"
                  onClick={() => void startCall("voice")}
                  aria-label="Start voice call"
                >
                  <Phone size={19} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => void startCall("video")}
                  aria-label="Start video call"
                >
                  <Video size={20} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setDetailsOpen((current) => !current)}
                  aria-label="Toggle contact details"
                >
                  <MoreHorizontal size={21} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-chat-heading">
              <h2>Select a conversation</h2>
              <p>Search for a CFAM member to start chatting.</p>
            </div>
          )}
        </header>
        <div className="chat-body">
          {activeConversation && (
            <>
              {activeConversation.messageRequestStatus === "pending" && activeConversation.messageRequestTo === user.uid && (
                <div className="message-request">
                  <strong>Message request</strong>
                  <p>This person wants to start a conversation with you.</p>
                  <button onClick={() => void acceptMessageRequest()}>Accept request</button>
                </div>
              )}
              <div className="chat-date">
                <span>Live</span>
              </div>
              <div className="message-stack">
                {messages.map((item) => (
                  <div
                    className={`message-row ${item.mine ? "mine" : ""}`}
                    key={item.id}
                    onPointerDown={() => {
                      if (item.mine) messagePressTimer.current = window.setTimeout(() => setMessageMenuId(item.id), 550);
                    }}
                    onPointerUp={() => { if (messagePressTimer.current) window.clearTimeout(messagePressTimer.current); }}
                    onPointerCancel={() => { if (messagePressTimer.current) window.clearTimeout(messagePressTimer.current); }}
                    onContextMenu={(event) => { if (item.mine) { event.preventDefault(); setMessageMenuId(item.id); } }}
                  >
                    {selectedMessageIds.length > 0 && item.mine && (
                      <input
                        className="message-select"
                        type="checkbox"
                        checked={selectedMessageIds.includes(item.id)}
                        onChange={() => setSelectedMessageIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}
                        aria-label="Select message"
                      />
                    )}
                    {!item.mine && (
                      <Avatar
                        initials={activeConversation.avatar}
                        color={activeConversation.color}
                        size="small"
                        photoUrl={activeConversation.photoUrl}
                      />
                    )}
                    <div className="message-bubble">
                      {item.type === "call" ? (
                        <p>
                          {item.text}
                          {item.durationSeconds
                            ? ` · ${Math.floor(item.durationSeconds / 60)}:${String(item.durationSeconds % 60).padStart(2, "0")}`
                            : ""}
                        </p>
                      ) : item.image ? (
                        <button className="image-preview-trigger" onClick={() => setPreviewImage(item.image ?? "")} aria-label="Open shared image">
                          <img className="message-image" src={item.image} alt="Shared in chat" />
                        </button>
                      ) : null}
                      {item.type !== "call" && item.text && <p>{item.text}</p>}
                      <div className="message-time">
                        {item.time} {item.mine && <CheckCheck size={14} />}
                      </div>
                    </div>
                    {messageMenuId === item.id && item.mine && (
                      <div className="message-menu">
                        <button onClick={() => void unsendMessage(item.id)}>Unsend</button>
                        <button onClick={() => { setSelectedMessageIds((current) => current.includes(item.id) ? current : [...current, item.id]); setMessageMenuId(null); }}>Select</button>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} aria-hidden="true" />
              </div>
              {selectedMessageIds.length > 0 && (
                <button className="delete-selected" onClick={() => void deleteSelectedMessages()}>Delete selected ({selectedMessageIds.length})</button>
              )}
            </>
          )}
        </div>
        <div className="composer">
          <div className="composer-tools">
            <button className="icon-button" aria-label="Attach file">
              <Paperclip size={19} />
            </button>
            <button
              className="icon-button"
              disabled={!activeConversation || isMessageRequestPending}
              onClick={() => imageInput.current?.click()}
              aria-label="Send image"
            >
              <Image size={19} />
            </button>
            <button className="icon-button" aria-label="Add emoji">
              <Smile size={19} />
            </button>
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void sendImage(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <input
            disabled={!activeConversation || isMessageRequestPending}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") sendMessage();
            }}
            placeholder={
              isMessageRequestPending
                ? "Accept the message request to reply"
                : activeConversation
                ? "Write a message..."
                : "Select a conversation first"
            }
            aria-label="Message"
          />
          <button
            className="send-button"
            disabled={!activeConversation || isMessageRequestPending}
            onClick={sendMessage}
            aria-label="Send message"
          >
            <Send size={17} />
          </button>
        </div>
      </section>

      {detailsOpen && activeConversation && (
        <aside className="details-panel">
          <div className="details-heading">
            <span>Contact details</span>
            <button
              className="icon-button"
              onClick={() => setDetailsOpen(false)}
              aria-label="Close contact details"
            >
              <X size={18} />
            </button>
          </div>
          <div className="contact-profile">
            <Avatar
              initials={activeConversation.avatar}
              color={activeConversation.color}
              size="large"
              photoUrl={activeConversation.photoUrl}
            />
            <h2>{activeConversation.name}</h2>
            <p>{activeConversation.handle}</p>
            <span className="profile-status">
              <span className="online-dot offline-dot" /> Offline
            </span>
          </div>
          <div className="quick-actions">
            <button onClick={() => void startCall("voice")}>
              <Phone size={18} />
              <span>Call</span>
            </button>
            <button onClick={() => void startCall("video")}>
              <Video size={18} />
              <span>Video</span>
            </button>
            <button onClick={() => setShowContactProfile(true)}>
              <UserRound size={18} />
              <span>Profile</span>
            </button>
          </div>
        </aside>
      )}

      {incomingCall && !callMode && (
        <div className="call-overlay">
          <div className="call-background">
            <div className="call-person incoming-call-person">
              <Avatar initials="CF" color="plum" size="large" photoUrl={incomingCall.callerPhotoUrl} />
              <h2>{incomingCall.callerName}</h2>
              <p>Incoming {incomingCall.mode === "video" ? "video" : "voice"} call</p>
              <div className="call-controls incoming-call-controls">
                <button className="end-call" onClick={() => { setIncomingCall(null); void updateDoc(doc(db, "calls", incomingCall.id), { status: "ended" }); }} aria-label="Decline call"><Phone size={22} /></button>
                <button onClick={() => void acceptCall()} aria-label="Accept call"><Check size={21} /></button>
              </div>
            </div>
          </div>
        </div>
      )}
      {callMode && activeConversation && (
        <div className="call-overlay">
          <div className="call-background">
            <audio ref={remoteAudio} autoPlay />
            {callMode === "video" && <video ref={remoteVideo} className="call-remote-video" autoPlay muted playsInline onLoadedMetadata={playRemoteVideo} />}
            <div className="call-topbar">
              <span className="call-secure">
                <Check size={15} /> Encrypted call
              </span>
              <button
                className="call-close"
                onClick={() => void endCall()}
                aria-label="End call"
              >
                <X size={20} />
              </button>
            </div>
            <div className="call-participant-name">{activeConversation.handle || activeConversation.name}</div>
            <div className="call-status">{callStatus === "connected" ? formatCallDuration(callElapsed) : callStatus === "calling" ? "Calling..." : "Connecting..."}</div>
            {!(callMode === "video" && callStatus === "connected") && <div className="call-person">
              <Avatar
                initials={activeConversation.avatar}
                color={activeConversation.color}
                size="large"
                photoUrl={activeConversation.photoUrl}
              />
              <p>{callError || (callStatus === "connected" ? "Connected" : callStatus === "calling" ? "Calling..." : "Connecting...")}</p>
            </div>}
            {callMode === "video" && <div className="call-local-video"><video ref={localVideo} autoPlay muted playsInline /></div>}
            <div className="call-controls">
              <button onClick={() => { localStream.current?.getAudioTracks().forEach((track) => { track.enabled = isMuted; }); setIsMuted((current) => !current); }} aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}>
                <Mic size={21} />
              </button>
              {callMode === "video" && (
                <button onClick={() => { localStream.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOff; }); setCameraOff((current) => !current); }} aria-label="Turn off camera">
                  <Video size={21} />
                </button>
              )}
              <button
                className="end-call"
                onClick={() => void endCall()}
                aria-label="End call"
              >
                <Phone size={22} />
              </button>
              <button aria-label="More call options" onClick={() => setCallError("Call is secured with peer-to-peer WebRTC audio and video.")}>
                <MoreHorizontal size={22} />
              </button>
            </div>
          </div>
        </div>
      )}
      {showProfile && (
        <ProfileModal
          profile={currentProfile}
          userId={user.uid}
          onClose={() => setShowProfile(false)}
          onSaved={(nextProfile) => {
            setCurrentProfile(nextProfile);
            setShowProfile(false);
          }}
        />
      )}
      {showContactProfile && activeConversation && (
        <ContactProfileModal
          conversation={activeConversation}
          onClose={() => setShowContactProfile(false)}
        />
      )}
      {previewImage && (
        <div className="image-preview-backdrop" onClick={() => setPreviewImage(null)} role="dialog" aria-label="Image preview">
          <button className="image-preview-close" onClick={() => setPreviewImage(null)} aria-label="Close image preview"><X size={22} /></button>
          <img className="image-preview" src={previewImage} alt="Preview of shared image" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </main>
  );
}

function ContactProfileModal({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Contact profile</p>
            <h2>{conversation.name}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close contact profile">
            <X size={19} />
          </button>
        </div>
        <div className="profile-upload">
          <div className="profile-photo">
            <Avatar
              initials={conversation.avatar}
              color={conversation.color}
              size="large"
              photoUrl={conversation.photoUrl}
            />
          </div>
          <div>
            <strong>{conversation.handle || "CFAM member"}</strong>
            <p>{conversation.lastMessage || "Connected on CFAM"}</p>
          </div>
        </div>
        <div className="profile-details">
          <span>Username</span>
          <strong>{conversation.handle || "Not available"}</strong>
        </div>
      </div>
    </div>
  );
}

function ProfileModal({
  profile,
  userId,
  onClose,
  onSaved,
}: {
  profile: UserProfile;
  userId: string;
  onClose: () => void;
  onSaved: (profile: UserProfile) => void;
}) {
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const nextProfile = { ...profile, photoUrl };
      await updateDoc(doc(db, "users", userId), { photoUrl });
      onSaved(nextProfile);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message.replace("Firebase: ", "")
          : "Unable to update your profile image.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="profile-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Your profile</p>
            <h2>
              {profile.firstName} {profile.lastName}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close profile"
          >
            <X size={19} />
          </button>
        </div>
        <div className="profile-upload">
          <div className="profile-photo">
            <Avatar
              initials={`${profile.firstName[0]}${profile.lastName[0]}`}
              color="plum"
              size="large"
              photoUrl={photoUrl}
            />
            <button
              onClick={() => imageInput.current?.click()}
              aria-label="Change profile image"
            >
              <Camera size={16} />
            </button>
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void compressImage(file).then(setPhotoUrl);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div>
            <strong>Profile image</strong>
            <p>Choose a new image, then save your profile.</p>
          </div>
        </div>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Username
          <input readOnly value={profile.username} />
        </label>
        <div className="form-grid">
          <label>
            First name
            <input readOnly value={profile.firstName} />
          </label>
          <label>
            Last name
            <input readOnly value={profile.lastName} />
          </label>
        </div>
        <label>
          Age
          <input readOnly value={profile.age} type="number" />
        </label>
        <button
          className="save-profile"
          disabled={busy}
          onClick={() => void save()}
        >
          <Check size={17} /> {busy ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}

function AuthScreen({
  onSignupFlowChange,
  onSignupComplete,
}: {
  onSignupFlowChange: (active: boolean) => void;
  onSignupComplete: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [countryCode, setCountryCode] = useState("+977");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!email.trim() || !phone.trim() || !password)
          throw new Error("Email, phone number, and password are required.");
        const localPhone = phone.replace(/\D/g, "");
        if (!/^\d{10}$/.test(localPhone))
          throw new Error("Enter the complete 10-digit mobile number.");
        onSignupFlowChange(true);
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const normalized = username.trim().toLowerCase();
        await setDoc(doc(db, "users", credential.user.uid), {
          username: normalized,
          usernameLower: normalized,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          age: Number(age),
          phoneNumber: `${countryCode}${localPhone}`,
          emailVerified: false,
          createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, "usernames", normalized), { uid: credential.user.uid });
        await sendVerificationEmail(credential.user);
        await onSignupComplete();
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message.replace("Firebase: ", "")
          : "Unable to continue.",
      );
    } finally {
      setBusy(false);
    }
  };
  const signupDetails = mode === "signup";
  return (
    <main className="auth-shell">
      <div className="auth-art">
        <div className="brand-mark">C</div>
        <p className="auth-kicker">CFAM (Connect Family) by Amin</p>
        <h1>
          Keep your people
          <br />
          <em>close.</em>
        </h1>
        <p>
          Private conversations, shared moments, and the people who matter most.
        </p>
        <div className="auth-orbit">
          <span>✦</span>
          <span>♡</span>
          <span>✦</span>
        </div>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">
          {mode === "login"
            ? "Welcome back"
            : signupDetails
              ? "Join the family"
              : "Join the family"}
        </p>
        <h2>
          {mode === "login"
            ? "Sign in to CFAM"
            : signupDetails
              ? "Create your account"
              : "Create your account"}
        </h2>
        <p className="auth-subtitle">
          {mode === "login"
            ? "Your conversations are waiting for you."
            : signupDetails
              ? "Enter your contact details. We will send a verification link by email."
              : "Your conversations are waiting for you."}
        </p>
        {signupDetails && (
          <>
            <div className="form-grid">
              <label>
                First name
                <input
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </label>
              <label>
                Last name
                <input
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Username
                <input
                  required
                  pattern="[A-Za-z0-9._\\-]+"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="alex.rivera"
                />
              </label>
              <label>
                Age
                <input
                  required
                  min="13"
                  max="120"
                  type="number"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                />
              </label>
            </div>
            <label>
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Phone number
              <div className="phone-input-row">
                <select
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value)}
                  aria-label="Country code"
                >
                  <option value="+977">Nepal (+977)</option>
                  <option value="+91">India (+91)</option>
                </select>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="9811003628"
                />
              </div>
            </label>
            <label>
              Password
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}
        {mode === "login" && (
          <>
            <label>
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" disabled={busy}>
          {busy
            ? "Please wait..."
            : mode === "login"
              ? "Sign in"
              : "Verify your account"}{" "}
          <ArrowLeft size={17} />
        </button>
        <p className="auth-switch">
          {mode === "login" ? "New to CFAM?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </main>
  );
}

function VerificationScreen({
  user,
  onVerified,
}: {
  user: User;
  onVerified: (user: User) => Promise<void>;
}) {
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const goToDashboard = async () => {
    setChecking(true);
    setError("");
    try {
      await user.reload();
      if (!user.emailVerified) {
        setError(
          "Your email is not verified yet. Open the link in your inbox, then try again.",
        );
        return;
      }
      await onVerified(user);
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message.replace("Firebase: ", "")
          : "Unable to check verification status.",
      );
    } finally {
      setChecking(false);
    }
  };
  return (
    <main className="auth-shell">
      <div className="auth-art">
        <div className="brand-mark">C</div>
        <p className="auth-kicker">ONE MORE STEP</p>
        <h1>
          Check your
          <br />
          <em>inbox.</em>
        </h1>
        <p>
          CFAM sent a verification link to {user.email}. Verify it to keep your
          account secure.
        </p>
      </div>
      <div className="auth-card">
        <p className="eyebrow">Email verification</p>
        <h2>Verify your email</h2>
        <p className="auth-subtitle">
          After you click the link, come back here and continue to your
          dashboard.
        </p>
        {error && <p className="auth-error">{error}</p>}
        <button
          className="auth-submit"
          disabled={checking}
          onClick={() => void goToDashboard()}
        >
          {checking ? "Checking verification..." : "Go to dashboard"}{" "}
          <ArrowLeft size={17} />
        </button>
        <button
          className="auth-secondary"
          disabled={sent}
          onClick={async () => {
            setError("");
            try {
              await sendVerificationEmail(user);
              setSent(true);
            } catch (resendError) {
              setError(
                resendError instanceof Error
                  ? resendError.message.replace("Firebase: ", "")
                  : "Unable to send the verification email.",
              );
            }
          }}
        >
          {sent ? "Verification email sent" : "Resend verification email"}
        </button>
        <button className="auth-switch" onClick={() => void signOut(auth)}>
          Sign out
        </button>
      </div>
    </main>
  );
}

function ProfileSetupScreen({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (profile: UserProfile) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const normalized = username.trim().toLowerCase();
      const profile = {
        username: normalized,
        usernameLower: normalized,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        age: Number(age),
        photoUrl,
        emailVerified: user.emailVerified,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", user.uid), profile);
      await setDoc(doc(db, "usernames", normalized), { uid: user.uid });
      onSaved(profile);
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message.replace("Firebase: ", "")
          : "Unable to save your profile.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-shell">
      <div className="auth-art">
        <div className="brand-mark">C</div>
        <p className="auth-kicker">WELCOME TO CFAM</p>
        <h1>
          Make it
          <br />
          <em>yours.</em>
        </h1>
        <p>
          Your account is verified. Add a few details so people know who they
          are talking to.
        </p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">First-time setup</p>
        <h2>Complete your profile</h2>
        <p className="auth-subtitle">
          This information is stored securely in Firestore.
        </p>
        <div className="setup-photo">
          <Avatar
            initials={`${firstName[0] ?? ""}${lastName[0] ?? ""}`}
            color="plum"
            size="large"
            photoUrl={photoUrl}
          />
          <label className="photo-picker">
            {photoUrl ? "Change image" : "Add profile image"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void compressImage(file).then(setPhotoUrl);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            First name
            <input
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label>
            Last name
            <input
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Username
            <input
              required
              pattern="[A-Za-z0-9._\\-]+"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="alex.rivera"
            />
          </label>
          <label>
            Age
            <input
              required
              min="13"
              max="120"
              type="number"
              value={age}
              onChange={(event) => setAge(event.target.value)}
            />
          </label>
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" disabled={busy}>
          {busy ? "Saving profile..." : "Enter CFAM"} <ArrowLeft size={17} />
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => void signOut(auth)}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setAuthRefresh] = useState(0);
  const authFlowRef = useRef(false);
  useEffect(
    () =>
      onAuthStateChanged(auth, async (nextUser) => {
        if (authFlowRef.current) return;
        setUser(nextUser);
        if (nextUser) {
          const profileSnapshot = await getDoc(doc(db, "users", nextUser.uid));
          setProfile(
            profileSnapshot.exists()
              ? (profileSnapshot.data() as UserProfile)
              : null,
          );
        } else setProfile(null);
        setLoading(false);
      }),
    [],
  );
  const continueAfterVerification = async (verifiedUser: User) => {
    setUser(verifiedUser);
    const profileSnapshot = await getDoc(doc(db, "users", verifiedUser.uid));
    setProfile(
      profileSnapshot.exists() ? (profileSnapshot.data() as UserProfile) : null,
    );
    setAuthRefresh((current) => current + 1);
  };
  const continueAfterSignup = async () => {
    authFlowRef.current = false;
    const signedInUser = auth.currentUser;
    if (!signedInUser) return;
    setUser(signedInUser);
    const profileSnapshot = await getDoc(doc(db, "users", signedInUser.uid));
    setProfile(
      profileSnapshot.exists() ? (profileSnapshot.data() as UserProfile) : null,
    );
  };
  if (loading)
    return (
      <main className="auth-loading">
        <div className="brand-mark">C</div>
        <p>Opening CFAM...</p>
      </main>
    );
  if (!user)
    return (
      <AuthScreen
        onSignupFlowChange={(active) => {
          authFlowRef.current = active;
        }}
        onSignupComplete={continueAfterSignup}
      />
    );
  if (!user.emailVerified)
    return (
      <VerificationScreen user={user} onVerified={continueAfterVerification} />
    );
  if (!profile) return <ProfileSetupScreen user={user} onSaved={setProfile} />;
  return <Workspace user={user} profile={profile} />;
}

export default App;
