import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConfirmationResult, User } from 'firebase/auth'
import { RecaptchaVerifier, createUserWithEmailAndPassword, linkWithPhoneNumber, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import type { FormEvent } from 'react'
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
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
} from 'lucide-react'
import './App.css'
import './auth.css'
import './mobile.css'
import './profile-image.css'
import './search.css'
import './data-status.css'
import './sections.css'
import './verification.css'
import './verification-choice.css'
import { auth, db } from './lib/firebase'

type Conversation = {
  id: string
  name: string
  handle: string
  avatar: string
  color: string
  lastMessage: string
  time: string
  unread?: number
  online?: boolean
  kind?: 'group'
  archivedBy?: string[]
  updatedAt?: number
}

type ChatMessage = {
  id: string
  mine: boolean
  text: string
  time: string
  image?: string
}

type UserProfile = { username: string; firstName: string; lastName: string; age: number; photoUrl?: string; emailVerified?: boolean; phoneVerified?: boolean }
type Person = UserProfile & { id: string; name: string; handle: string; meta: string; avatar: string; color: string }

function Avatar({ initials, color, size = 'medium', photoUrl }: { initials: string; color: string; size?: 'small' | 'medium' | 'large'; photoUrl?: string }) {
  return <div className={`avatar avatar-${size} avatar-${color} ${photoUrl ? 'avatar-with-image' : ''}`} style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}>{!photoUrl && initials}</div>
}

function compressImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new window.Image()
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      image.onerror = reject
      image.src = String(reader.result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function Workspace({ user, profile }: { user: User; profile: UserProfile }) {
  const [currentProfile, setCurrentProfile] = useState(profile)
  const [activeId, setActiveId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [callMode, setCallMode] = useState<'voice' | 'video' | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [dataError, setDataError] = useState('')
  const [activeSection, setActiveSection] = useState<'messages' | 'notifications' | 'archived'>('messages')
  const [notifications, setNotifications] = useState<{ id: string; text: string; createdAt?: { toDate?: () => Date }; read?: boolean }[]>([])
  const imageInput = useRef<HTMLInputElement>(null)

  const activeConversation = conversations.find((conversation) => conversation.id === activeId)
  const filteredPeople = useMemo(() => people.filter((person) => `${person.name} ${person.handle}`.toLowerCase().includes(search.toLowerCase())), [people, search])
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const archived = conversation.archivedBy?.includes(user.uid) ?? false
    const matchesSearch = `${conversation.name} ${conversation.handle} ${conversation.lastMessage}`.toLowerCase().includes(search.toLowerCase())
    return activeSection === 'archived' ? archived && matchesSearch : !archived && matchesSearch
  }), [activeSection, conversations, search, user.uid])

  const openPerson = async (person: Person) => {
    const conversationId = [user.uid, person.id].sort().join('_')
    await setDoc(doc(db, 'conversations', conversationId), {
      memberIds: [user.uid, person.id],
      memberNames: { [user.uid]: `${profile.firstName} ${profile.lastName}`, [person.id]: person.name },
      memberHandles: { [user.uid]: `@${profile.username}`, [person.id]: person.handle },
      memberAvatars: { [user.uid]: `${profile.firstName[0]}${profile.lastName[0]}`, [person.id]: person.avatar },
      memberColors: { [user.uid]: 'plum', [person.id]: person.color },
      lastMessage: 'Start a conversation',
      updatedAt: serverTimestamp(),
    }, { merge: true })
    setActiveId(conversationId)
    setSearch('')
  }

  useEffect(() => {
    const conversationQuery = query(collection(db, 'conversations'), where('memberIds', 'array-contains', user.uid), limit(100))
    return onSnapshot(conversationQuery, (snapshot) => {
      setDataError('')
      setConversations(snapshot.docs.map((item) => {
        const data = item.data()
        const otherId = (data.memberIds as string[]).find((id) => id !== user.uid) ?? user.uid
        return { id: item.id, name: data.memberNames?.[otherId] ?? 'Conversation', handle: data.memberHandles?.[otherId] ?? '', avatar: data.memberAvatars?.[otherId] ?? '?', color: data.memberColors?.[otherId] ?? 'plum', lastMessage: data.lastMessage ?? 'Start a conversation', time: data.lastMessageAt?.toDate?.().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) ?? '', online: false, archivedBy: data.archivedBy ?? [], updatedAt: data.updatedAt?.toMillis?.() ?? 0 }
      }).sort((left, right) => right.updatedAt - left.updatedAt))
    }, () => setDataError('Unable to load your inbox right now.'))
  }, [user.uid])

  useEffect(() => onSnapshot(query(collection(db, 'notifications'), where('userId', '==', user.uid), limit(50)), (snapshot) => setNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() as { text: string; createdAt?: { toDate?: () => Date }; read?: boolean } }))), () => setDataError('Unable to load notifications right now.')), [user.uid])

  useEffect(() => onSnapshot(query(collection(db, 'users'), limit(100)), (snapshot) => setPeople(snapshot.docs.filter((item) => item.id !== user.uid).map((item) => {
    const data = item.data() as UserProfile
    return { ...data, id: item.id, name: `${data.firstName} ${data.lastName}`, handle: `@${data.username}`, meta: 'CFAM member', avatar: `${data.firstName?.[0] ?? ''}${data.lastName?.[0] ?? ''}`, color: 'plum' }
  })), (error) => setDataError(error.code === 'permission-denied' ? 'People search is unavailable. Check your Firestore rules.' : 'Unable to load people right now.')), [user.uid])

  useEffect(() => {
    if (!activeId) return
    return onSnapshot(query(collection(db, 'conversations', activeId, 'messages'), orderBy('createdAt', 'asc'), limit(200)), (snapshot) => setMessages(snapshot.docs.map((item) => { const data = item.data(); return { id: item.id, mine: data.senderId === user.uid, text: data.text ?? '', time: data.createdAt?.toDate?.().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) ?? 'Now', image: data.imageBase64 } })), (error) => setDataError(error.code === 'permission-denied' ? 'You are not a member of this conversation.' : 'Unable to load messages right now.'))
  }, [activeId, user.uid])

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline) }
  }, [])

  const sendMessage = () => {
    const trimmed = message.trim()
    if (!trimmed) return
    if (!activeId) return
    void addDoc(collection(db, 'conversations', activeId, 'messages'), { senderId: user.uid, text: trimmed, type: 'text', createdAt: serverTimestamp() })
    void updateDoc(doc(db, 'conversations', activeId), { lastMessage: trimmed, lastMessageAt: serverTimestamp(), updatedAt: serverTimestamp() })
    setMessage('')
  }

  const sendImage = async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    const image = await compressImage(file)
    if (!activeId) return
    void addDoc(collection(db, 'conversations', activeId, 'messages'), { senderId: user.uid, text: '', type: 'image', imageBase64: image, createdAt: serverTimestamp() })
    void updateDoc(doc(db, 'conversations', activeId), { lastMessage: 'Image', lastMessageAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }

  const archiveConversation = async (conversation: Conversation) => {
    await updateDoc(doc(db, 'conversations', conversation.id), { archivedBy: conversation.archivedBy?.includes(user.uid) ? arrayRemove(user.uid) : arrayUnion(user.uid) })
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''} ${detailsOpen ? 'details-is-open' : ''} ${mobileChatOpen ? 'mobile-chat-open' : ''}`}>
      <aside className={`sidebar ${showMobileNav ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="brand-row"><div className="brand-mark">C</div><span>CFAM</span><button className="icon-button sidebar-toggle mobile-close" onClick={() => setShowMobileNav(false)} aria-label="Close menu"><X size={19} /></button><button className="icon-button sidebar-toggle desktop-toggle" onClick={() => setSidebarCollapsed((current) => !current)} aria-label="Collapse sidebar">{sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button></div>
        <div className="profile-mini" onClick={() => setShowProfile(true)} role="button" tabIndex={0}><Avatar initials={`${currentProfile.firstName[0]}${currentProfile.lastName[0]}`} color="plum" size="small" photoUrl={currentProfile.photoUrl} /><span><strong>{currentProfile.firstName} {currentProfile.lastName}</strong><small>@{currentProfile.username}</small></span><ChevronDown size={15} /></div>
        <nav className="main-nav"><p className="nav-label">Workspace</p><button className={`nav-item ${activeSection === 'messages' ? 'active' : ''}`} onClick={() => setActiveSection('messages')}><UsersRound size={18} /> Messages <span className="nav-count">{conversations.filter((conversation) => !conversation.archivedBy?.includes(user.uid)).length}</span></button><button className={`nav-item ${activeSection === 'notifications' ? 'active' : ''}`} onClick={() => setActiveSection('notifications')}><Bell size={18} /> Notifications {notifications.some((notification) => !notification.read) && <span className="nav-dot" />}</button><button className={`nav-item ${activeSection === 'archived' ? 'active' : ''}`} onClick={() => setActiveSection('archived')}><Archive size={18} /> Archived <span className="nav-count">{conversations.filter((conversation) => conversation.archivedBy?.includes(user.uid)).length}</span></button><p className="nav-label nav-label-spaced">Manage</p><button className="nav-item"><Settings size={18} /> Settings</button><button className="nav-item"><CircleHelp size={18} /> Help center</button></nav>
        <div className="sidebar-bottom"><div className="plan-card"><div className="plan-top"><Sparkles size={15} /><span>Personal space</span></div><p>Make conversations feel more like you.</p><button onClick={() => setShowProfile(true)}>Edit your profile <ArrowLeft size={15} /></button></div><button className="logout-button" onClick={() => void signOut(auth)}><LogOut size={17} /> Sign out</button><small className="version">CFAM v1.0 · Call family</small></div>
      </aside>

      <section className="conversation-panel">
        <header className="panel-header"><button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button><div><p className="eyebrow">Your inbox</p><h1>{activeSection === 'notifications' ? 'Notifications' : activeSection === 'archived' ? 'Archived' : 'Messages'}</h1></div>{activeSection === 'messages' && <button className="new-message" aria-label="Start a new message">+ <span>New message</span></button>}</header>
        <div className="conversation-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations or people" aria-label="Search conversations or people" /><button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search"><X size={16} /></button></div>
        <div className="conversation-list">{dataError && <p className="data-error">{dataError}</p>}{activeSection === 'notifications' ? <div className="notification-list">{notifications.length === 0 ? <p className="empty-search">No notifications yet.</p> : notifications.map((notification) => <div className={`notification-row ${notification.read ? '' : 'unread'}`} key={notification.id}><Bell size={16} /><span><strong>{notification.text}</strong><small>{notification.createdAt?.toDate?.()?.toLocaleString() ?? 'Just now'}</small></span></div>)}</div> : <><div className="list-title"><span>{activeSection === 'archived' ? 'Archived conversations' : search ? 'Search results' : 'Recent · live'}</span><button className="filter-button">All <ChevronDown size={14} /></button></div>{visibleConversations.map((conversation) => <div className="conversation-entry" key={conversation.id}><button className={`conversation-row ${activeId === conversation.id ? 'selected' : ''}`} onClick={() => { setActiveId(conversation.id); setMobileChatOpen(true); setShowMobileNav(false) }}><Avatar initials={conversation.avatar} color={conversation.color} /><span className="conversation-copy"><strong>{conversation.name}</strong><small>{conversation.lastMessage}</small></span><span className="conversation-meta"><small>{conversation.time}</small></span></button><button className="archive-action" onClick={() => void archiveConversation(conversation)} aria-label={activeSection === 'archived' ? 'Restore conversation' : 'Archive conversation'}>{activeSection === 'archived' ? 'Restore' : 'Archive'}</button></div>)}{activeSection === 'messages' && search && filteredPeople.length > 0 && <div className="inline-people"><p className="inline-results-label">People</p>{filteredPeople.map((person) => <button key={person.handle} className="person-result" onClick={() => { void openPerson(person) }}><Avatar initials={person.avatar} color={person.color} size="small" /><span><strong>{person.name}</strong><small>{person.handle} · {person.meta}</small></span><ArrowLeft size={16} /></button>)}</div>}{search && visibleConversations.length === 0 && filteredPeople.length === 0 && <p className="empty-search">No conversations or people found for “{search}”.</p>}</>}</div>
        <div className="discover-card"><div className="discover-icon"><Search size={18} /></div><div><strong>Find your people</strong><p>Search by username to start a new conversation.</p></div><ArrowLeft size={17} className="discover-arrow" /></div>
      </section>

      <section className="chat-panel">
        <header className="chat-header"><button className="icon-button mobile-back" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations"><ArrowLeft size={21} /></button><button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button>{activeConversation ? <><button className="chat-person chat-person-button" onClick={() => setDetailsOpen((current) => !current)} aria-label="Toggle contact details"><Avatar initials={activeConversation.avatar} color={activeConversation.color} /><div><h2>{activeConversation.name}</h2><p><span className={`online-dot ${isOnline ? '' : 'offline-dot'}`} /> {isOnline ? 'Online' : 'Offline'}</p></div></button><div className="chat-actions"><button className="icon-button" onClick={() => setCallMode('voice')} aria-label="Start voice call"><Phone size={19} /></button><button className="icon-button" onClick={() => setCallMode('video')} aria-label="Start video call"><Video size={20} /></button><button className="icon-button" onClick={() => setDetailsOpen((current) => !current)} aria-label="Toggle contact details"><MoreHorizontal size={21} /></button></div></> : <div className="empty-chat-heading"><h2>Select a conversation</h2><p>Search for a CFAM member to start chatting.</p></div>}</header>
        <div className="chat-body">{activeConversation && <><div className="chat-date"><span>Live</span></div><div className="message-stack">{messages.map((item) => <div className={`message-row ${item.mine ? 'mine' : ''}`} key={item.id}>{!item.mine && <Avatar initials={activeConversation.avatar} color={activeConversation.color} size="small" />}<div className="message-bubble">{item.image && <img className="message-image" src={item.image} alt="Shared in chat" />} {item.text && <p>{item.text}</p>}<div className="message-time">{item.time} {item.mine && <CheckCheck size={14} />}</div></div></div>)}</div></>}</div>
        <div className="composer"><div className="composer-tools"><button className="icon-button" aria-label="Attach file"><Paperclip size={19} /></button><button className="icon-button" onClick={() => imageInput.current?.click()} aria-label="Send image"><Image size={19} /></button><button className="icon-button" aria-label="Add emoji"><Smile size={19} /></button><input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => { void sendImage(event.target.files?.[0]); event.currentTarget.value = '' }} /></div><input disabled={!activeConversation} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendMessage() }} placeholder={activeConversation ? 'Write a message...' : 'Select a conversation first'} aria-label="Message" /><button className="send-button" disabled={!activeConversation} onClick={sendMessage} aria-label="Send message"><Send size={17} /></button></div>
      </section>

      {detailsOpen && activeConversation && <aside className="details-panel"><div className="details-heading"><span>Contact details</span><button className="icon-button" onClick={() => setDetailsOpen(false)} aria-label="Close contact details"><X size={18} /></button></div><div className="contact-profile"><Avatar initials={activeConversation.avatar} color={activeConversation.color} size="large" /><h2>{activeConversation.name}</h2><p>{activeConversation.handle}</p><span className="profile-status"><span className="online-dot offline-dot" /> Offline</span></div><div className="quick-actions"><button onClick={() => setCallMode('voice')}><Phone size={18} /><span>Call</span></button><button onClick={() => setCallMode('video')}><Video size={18} /><span>Video</span></button><button onClick={() => setShowProfile(true)}><UserRound size={18} /><span>Profile</span></button></div></aside>}

      {callMode && activeConversation && <div className="call-overlay"><div className="call-background"><div className="call-topbar"><span className="call-secure"><Check size={15} /> Encrypted call</span><button className="call-close" onClick={() => setCallMode(null)} aria-label="End call"><X size={20} /></button></div><div className="call-person"><Avatar initials={activeConversation.avatar} color={activeConversation.color} size="large" /><h2>{activeConversation.name}</h2><p>{callMode === 'video' ? 'Video calling' : 'Calling'} · connecting...</p></div><div className="call-local-video"><Camera size={19} /><span>You</span></div><div className="call-controls"><button aria-label="Mute microphone"><Mic size={21} /></button>{callMode === 'video' && <button aria-label="Turn off camera"><Video size={21} /></button>}<button className="end-call" onClick={() => setCallMode(null)} aria-label="End call"><Phone size={22} /></button><button aria-label="More call options"><MoreHorizontal size={22} /></button></div></div></div>}
      {showProfile && <ProfileModal profile={currentProfile} userId={user.uid} onClose={() => setShowProfile(false)} onSaved={(nextProfile) => { setCurrentProfile(nextProfile); setShowProfile(false) }} />}
    </main>
  )
}

function ProfileModal({ profile, userId, onClose, onSaved }: { profile: UserProfile; userId: string; onClose: () => void; onSaved: (profile: UserProfile) => void }) {
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const imageInput = useRef<HTMLInputElement>(null)
  const save = async () => {
    setBusy(true); setError('')
    try {
      const nextProfile = { ...profile, photoUrl }
      await updateDoc(doc(db, 'users', userId), { photoUrl })
      onSaved(nextProfile)
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message.replace('Firebase: ', '') : 'Unable to update your profile image.') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="profile-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Your profile</p><h2>{profile.firstName} {profile.lastName}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close profile"><X size={19} /></button></div><div className="profile-upload"><div className="profile-photo"><Avatar initials={`${profile.firstName[0]}${profile.lastName[0]}`} color="plum" size="large" photoUrl={photoUrl} /><button onClick={() => imageInput.current?.click()} aria-label="Change profile image"><Camera size={16} /></button><input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void compressImage(file).then(setPhotoUrl); event.currentTarget.value = '' }} /></div><div><strong>Profile image</strong><p>Choose a new image, then save your profile.</p></div></div>{error && <p className="auth-error">{error}</p>}<label>Username<input readOnly value={profile.username} /></label><div className="form-grid"><label>First name<input readOnly value={profile.firstName} /></label><label>Last name<input readOnly value={profile.lastName} /></label></div><label>Age<input readOnly value={profile.age} type="number" /></label><button className="save-profile" disabled={busy} onClick={() => void save()}><Check size={17} /> {busy ? 'Saving...' : 'Save profile'}</button></div></div>
}

function AuthScreen({ onSignupFlowChange, onSignupComplete }: { onSignupFlowChange: (active: boolean) => void; onSignupComplete: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [signupStep, setSignupStep] = useState<'details' | 'phone'>('details')
  const [verificationMethod, setVerificationMethod] = useState<'email' | 'sms'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [age, setAge] = useState('')
  const [countryCode, setCountryCode] = useState('+977')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const recaptcha = useRef<RecaptchaVerifier | null>(null)

  const resetRecaptcha = () => {
    recaptcha.current?.clear()
    recaptcha.current = null
  }

  useEffect(() => () => resetRecaptcha(), [])

  const createPhoneChallenge = async () => {
    const localPhone = phone.replace(/\D/g, '')
    if (!/^\d{10}$/.test(localPhone)) {
      setError('Enter the complete 10-digit mobile number.')
      return
    }
    const normalizedPhone = `${countryCode}${localPhone}`
    if (!recaptcha.current) recaptcha.current = new RecaptchaVerifier(auth, 'phone-recaptcha', { size: 'normal' })
    await recaptcha.current.render()
    const credential = auth.currentUser
    if (!credential) throw new Error('Your signup session expired. Please start again.')
    const result = await Promise.race([
      linkWithPhoneNumber(credential, normalizedPhone, recaptcha.current),
      new Promise<ConfirmationResult>((_, reject) => window.setTimeout(() => reject(new Error('Phone verification took too long. Complete the reCAPTCHA and try again.')), 30000)),
    ]).catch((requestError) => {
      resetRecaptcha()
      throw requestError
    })
    setConfirmation(result)
    setSignupStep('phone')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, password)
      else if (signupStep === 'details') {
        if (!email.trim() || !phone.trim() || !password) throw new Error('Email, phone number, and password are required.')
        const localPhone = phone.replace(/\D/g, '')
        if (!/^\d{10}$/.test(localPhone)) throw new Error('Enter the complete 10-digit mobile number.')
        const normalizedPhone = `${countryCode}${localPhone}`
        onSignupFlowChange(true)
        const credential = auth.currentUser ?? await createUserWithEmailAndPassword(auth, email, password)
        const signedUpUser = 'user' in credential ? credential.user : credential
        if (verificationMethod === 'sms') await createPhoneChallenge()
        else {
          const normalized = username.trim().toLowerCase()
          await setDoc(doc(db, 'users', signedUpUser.uid), { username: normalized, usernameLower: normalized, firstName: firstName.trim(), lastName: lastName.trim(), age: Number(age), phoneNumber: normalizedPhone, emailVerified: false, phoneVerified: false, verificationMethod, createdAt: serverTimestamp() })
          await setDoc(doc(db, 'usernames', normalized), { uid: signedUpUser.uid })
          await sendEmailVerification(signedUpUser)
          await onSignupComplete()
        }
      } else if (!confirmation) throw new Error('Request a verification code first.')
      else {
        const phoneCredential = await confirmation.confirm(code.trim())
        const normalized = username.trim().toLowerCase()
        await setDoc(doc(db, 'users', phoneCredential.user.uid), { username: normalized, usernameLower: normalized, firstName: firstName.trim(), lastName: lastName.trim(), age: Number(age), phoneNumber: phone.trim(), emailVerified: false, phoneVerified: true, verificationMethod, createdAt: serverTimestamp() })
        await setDoc(doc(db, 'usernames', normalized), { uid: phoneCredential.user.uid })
        await onSignupComplete()
      }
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message.replace('Firebase: ', '') : 'Unable to continue.') }
    finally { setBusy(false) }
  }
  const signupDetails = mode === 'signup' && signupStep === 'details'
  const signupMode = mode === 'signup'
  return <main className="auth-shell"><div className="auth-art"><div className="brand-mark">C</div><p className="auth-kicker">CALL FAMILY</p><h1>Keep your people<br /><em>close.</em></h1><p>Private conversations, shared moments, and the people who matter most.</p><div className="auth-orbit"><span>✦</span><span>♡</span><span>✦</span></div></div><form className="auth-card" onSubmit={submit}><p className="eyebrow">{mode === 'login' ? 'Welcome back' : signupDetails ? 'Join the family' : 'Phone verification'}</p><h2>{mode === 'login' ? 'Sign in to CFAM' : signupDetails ? 'Create your account' : 'Verify your phone'}</h2><p className="auth-subtitle">{mode === 'login' ? 'Your conversations are waiting for you.' : signupDetails ? 'Enter both contact details, then choose how to verify.' : `Enter the code sent to ${phone}.`}</p>{signupDetails && <div className="verification-choice"><span>Verify with</span><button type="button" className={verificationMethod === 'email' ? 'selected' : ''} onClick={() => setVerificationMethod('email')}>Email</button><button type="button" className={verificationMethod === 'sms' ? 'selected' : ''} onClick={() => setVerificationMethod('sms')}>SMS</button></div>}{signupDetails && <><div className="form-grid"><label>First name<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label>Last name<input required value={lastName} onChange={(event) => setLastName(event.target.value)} /></label></div><div className="form-grid"><label>Username<input required pattern="[A-Za-z0-9._-]+" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="alex.rivera" /></label><label>Age<input required min="13" max="120" type="number" value={age} onChange={(event) => setAge(event.target.value)} /></label></div><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Phone number<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+9779812345678" /></label><label>Password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></>}{mode === 'login' && <><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></>}{!signupDetails && mode === 'signup' && <label>SMS code<input required inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" /></label>}{error && <p className="auth-error">{error}</p>}{signupMode && signupDetails && verificationMethod === 'sms' && <div id="phone-recaptcha" className="phone-recaptcha" />}{<button className="auth-submit" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : signupDetails ? verificationMethod === 'sms' ? 'Send SMS code' : 'Send email verification' : 'Verify phone and continue'} <ArrowLeft size={17} /></button>}{mode === 'signup' && !signupDetails && <button type="button" className="auth-secondary" onClick={() => { setSignupStep('details'); setConfirmation(null); setError(''); resetRecaptcha() }}>Change phone number</button>}<p className="auth-switch">{mode === 'login' ? 'New to CFAM?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setSignupStep('details'); setConfirmation(null); setError(''); resetRecaptcha() }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p></form></main>
}

function VerificationScreen({ user, onVerified }: { user: User; onVerified: (user: User) => Promise<void> }) {
  const [sent, setSent] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const goToDashboard = async () => {
    setChecking(true)
    setError('')
    try {
      await user.reload()
      if (!user.emailVerified) {
        setError('Your email is not verified yet. Open the link in your inbox, then try again.')
        return
      }
      await onVerified(user)
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message.replace('Firebase: ', '') : 'Unable to check verification status.')
    } finally {
      setChecking(false)
    }
  }
  return <main className="auth-shell"><div className="auth-art"><div className="brand-mark">C</div><p className="auth-kicker">ONE MORE STEP</p><h1>Check your<br /><em>inbox.</em></h1><p>CFAM sent a verification link to {user.email}. Verify it to keep your account secure.</p></div><div className="auth-card"><p className="eyebrow">Email verification</p><h2>Verify your email</h2><p className="auth-subtitle">After you click the link, come back here and continue to your dashboard.</p>{error && <p className="auth-error">{error}</p>}<button className="auth-submit" disabled={checking} onClick={() => void goToDashboard()}>{checking ? 'Checking verification...' : 'Go to dashboard'} <ArrowLeft size={17} /></button><button className="auth-secondary" onClick={() => { void sendEmailVerification(user); setSent(true) }}>{sent ? 'Verification email sent' : 'Resend verification email'}</button><button className="auth-switch" onClick={() => void signOut(auth)}>Sign out</button></div></main>
}

function ProfileSetupScreen({ user, onSaved }: { user: User; onSaved: (profile: UserProfile) => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [age, setAge] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const normalized = username.trim().toLowerCase()
      const profile = { username: normalized, usernameLower: normalized, firstName: firstName.trim(), lastName: lastName.trim(), age: Number(age), photoUrl, emailVerified: user.emailVerified, createdAt: serverTimestamp() }
      await setDoc(doc(db, 'users', user.uid), profile)
      await setDoc(doc(db, 'usernames', normalized), { uid: user.uid })
      onSaved(profile)
    } catch (setupError) { setError(setupError instanceof Error ? setupError.message.replace('Firebase: ', '') : 'Unable to save your profile.') }
    finally { setBusy(false) }
  }
  return <main className="auth-shell"><div className="auth-art"><div className="brand-mark">C</div><p className="auth-kicker">WELCOME TO CFAM</p><h1>Make it<br /><em>yours.</em></h1><p>Your account is verified. Add a few details so people know who they are talking to.</p></div><form className="auth-card" onSubmit={submit}><p className="eyebrow">First-time setup</p><h2>Complete your profile</h2><p className="auth-subtitle">This information is stored securely in Firestore.</p><div className="setup-photo"><Avatar initials={`${firstName[0] ?? ''}${lastName[0] ?? ''}`} color="plum" size="large" photoUrl={photoUrl} /><label className="photo-picker">{photoUrl ? 'Change image' : 'Add profile image'}<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void compressImage(file).then(setPhotoUrl); event.currentTarget.value = '' }} /></label></div><div className="form-grid"><label>First name<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label>Last name<input required value={lastName} onChange={(event) => setLastName(event.target.value)} /></label></div><div className="form-grid"><label>Username<input required pattern="[A-Za-z0-9._-]+" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="alex.rivera" /></label><label>Age<input required min="13" max="120" type="number" value={age} onChange={(event) => setAge(event.target.value)} /></label></div>{error && <p className="auth-error">{error}</p>}<button className="auth-submit" disabled={busy}>{busy ? 'Saving profile...' : 'Enter CFAM'} <ArrowLeft size={17} /></button><button type="button" className="auth-switch" onClick={() => void signOut(auth)}>Sign out</button></form></main>
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setAuthRefresh] = useState(0)
  const authFlowRef = useRef(false)
  useEffect(() => onAuthStateChanged(auth, async (nextUser) => { if (authFlowRef.current) return; setUser(nextUser); if (nextUser) { const profileSnapshot = await getDoc(doc(db, 'users', nextUser.uid)); setProfile(profileSnapshot.exists() ? profileSnapshot.data() as UserProfile : null) } else setProfile(null); setLoading(false) }), [])
  const continueAfterVerification = async (verifiedUser: User) => {
    setUser(verifiedUser)
    const profileSnapshot = await getDoc(doc(db, 'users', verifiedUser.uid))
    setProfile(profileSnapshot.exists() ? profileSnapshot.data() as UserProfile : null)
    setAuthRefresh((current) => current + 1)
  }
  const continueAfterSignup = async () => {
    authFlowRef.current = false
    const signedInUser = auth.currentUser
    if (!signedInUser) return
    setUser(signedInUser)
    const profileSnapshot = await getDoc(doc(db, 'users', signedInUser.uid))
    setProfile(profileSnapshot.exists() ? profileSnapshot.data() as UserProfile : null)
  }
  if (loading) return <main className="auth-loading"><div className="brand-mark">C</div><p>Opening CFAM...</p></main>
  if (!user) return <AuthScreen onSignupFlowChange={(active) => { authFlowRef.current = active }} onSignupComplete={continueAfterSignup} />
  if (!user.emailVerified && !profile?.phoneVerified) return <VerificationScreen user={user} onVerified={continueAfterVerification} />
  if (!profile) return <ProfileSetupScreen user={user} onSaved={setProfile} />
  return <Workspace user={user} profile={profile} />
}

export default App
