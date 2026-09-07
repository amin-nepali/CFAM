import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  Bell,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  FileText,
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
}

type ChatMessage = {
  id: number
  mine: boolean
  text: string
  time: string
  image?: string
}

const conversations: Conversation[] = [
  { id: 'mia', name: 'Mia Anderson', handle: '@mia.anderson', avatar: 'MA', color: 'coral', lastMessage: 'That sounds perfect, see you then!', time: '10:42 AM', unread: 2, online: true },
  { id: 'design', name: 'Design team', handle: '@design-team', avatar: 'DT', color: 'gold', lastMessage: 'You: Shared the moodboard', time: 'Yesterday', kind: 'group' },
  { id: 'noah', name: 'Noah Williams', handle: '@noah.w', avatar: 'NW', color: 'blue', lastMessage: 'Voice message', time: 'Mon', online: true },
  { id: 'sophia', name: 'Sophia Chen', handle: '@sophia.chen', avatar: 'SC', color: 'mint', lastMessage: 'Can you send me the link?', time: 'Sun' },
]

const people = [
  { name: 'Ava Martinez', handle: '@ava.martinez', meta: 'Product designer', avatar: 'AM', color: 'plum' },
  { name: 'Mia Anderson', handle: '@mia.anderson', meta: 'Online now', avatar: 'MA', color: 'coral' },
  { name: 'Ethan Brooks', handle: '@ethan.brooks', meta: 'Photographer', avatar: 'EB', color: 'blue' },
]

function Avatar({ initials, color, size = 'medium' }: { initials: string; color: string; size?: 'small' | 'medium' | 'large' }) {
  return <div className={`avatar avatar-${size} avatar-${color}`}>{initials}</div>
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

function App() {
  const [activeId, setActiveId] = useState('mia')
  const [search, setSearch] = useState('')
  const [conversationSearch, setConversationSearch] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, mine: false, text: 'Hey Alex! How are you doing?', time: '10:39 AM' },
    { id: 2, mine: true, text: 'Hey Mia! I’m doing great. Just wrapped up the new project.', time: '10:40 AM' },
    { id: 3, mine: false, text: 'That’s exciting! I’d love to hear more about it.', time: '10:41 AM' },
    { id: 4, mine: true, text: 'Absolutely, let’s catch up over coffee this week?', time: '10:42 AM' },
    { id: 5, mine: false, text: 'That sounds perfect, see you then!', time: '10:42 AM' },
  ])
  const [callMode, setCallMode] = useState<'voice' | 'video' | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const imageInput = useRef<HTMLInputElement>(null)

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0]
  const filteredPeople = useMemo(() => people.filter((person) => `${person.name} ${person.handle}`.toLowerCase().includes(search.toLowerCase())), [search])
  const visibleConversations = useMemo(() => conversations.filter((conversation) => `${conversation.name} ${conversation.handle} ${conversation.lastMessage}`.toLowerCase().includes(conversationSearch.toLowerCase())), [conversationSearch])

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline) }
  }, [])

  const sendMessage = () => {
    const trimmed = message.trim()
    if (!trimmed) return
    setMessages((current) => [...current, { id: Date.now(), mine: true, text: trimmed, time: 'Just now' }])
    setMessage('')
  }

  const sendImage = async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    const image = await compressImage(file)
    setMessages((current) => [...current, { id: Date.now(), mine: true, text: '', image, time: 'Just now' }])
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''} ${detailsOpen ? 'details-is-open' : ''}`}>
      <aside className={`sidebar ${showMobileNav ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="brand-row"><div className="brand-mark">C</div><span>CFAM</span><button className="icon-button sidebar-toggle mobile-close" onClick={() => setShowMobileNav(false)} aria-label="Close menu"><X size={19} /></button><button className="icon-button sidebar-toggle desktop-toggle" onClick={() => setSidebarCollapsed((current) => !current)} aria-label="Collapse sidebar">{sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button></div>
        <div className="profile-mini" onClick={() => setShowProfile(true)} role="button" tabIndex={0}><Avatar initials="AR" color="plum" size="small" /><span><strong>Alex Rivera</strong><small>@alex.rivera</small></span><ChevronDown size={15} /></div>
        <nav className="main-nav"><p className="nav-label">Workspace</p><button className="nav-item active"><UsersRound size={18} /> Messages <span className="nav-count">4</span></button><button className="nav-item"><Bell size={18} /> Notifications <span className="nav-dot" /></button><button className="nav-item"><Archive size={18} /> Archived</button><p className="nav-label nav-label-spaced">Manage</p><button className="nav-item"><Settings size={18} /> Settings</button><button className="nav-item"><CircleHelp size={18} /> Help center</button></nav>
        <div className="sidebar-bottom"><div className="plan-card"><div className="plan-top"><Sparkles size={15} /><span>Personal space</span></div><p>Make conversations feel more like you.</p><button onClick={() => setShowProfile(true)}>Edit your profile <ArrowLeft size={15} /></button></div><button className="logout-button"><LogOut size={17} /> Sign out</button><small className="version">CFAM v1.0 · Call family</small></div>
      </aside>

      <section className="conversation-panel">
        <header className="panel-header"><button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button><div><p className="eyebrow">Your inbox</p><h1>Messages</h1></div><button className="new-message" aria-label="Start a new message">+ <span>New message</span></button></header>
        <div className="conversation-search"><Search size={17} /><input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /><kbd>⌘ K</kbd></div>
        <div className="conversation-list"><div className="list-title"><span>Recent · live</span><button className="filter-button">All <ChevronDown size={14} /></button></div>{visibleConversations.map((conversation) => <button className={`conversation-row ${activeId === conversation.id ? 'selected' : ''}`} key={conversation.id} onClick={() => { setActiveId(conversation.id); setShowMobileNav(false) }}><Avatar initials={conversation.avatar} color={conversation.color} /><span className="conversation-copy"><strong>{conversation.name}</strong><small>{conversation.lastMessage}</small></span><span className="conversation-meta"><small>{conversation.time}</small>{conversation.unread && <b>{conversation.unread}</b>}</span>{conversation.online && <span className="online-dot" />}</button>)}</div>
        <div className="discover-card"><div className="discover-icon"><Search size={18} /></div><div><strong>Find your people</strong><p>Search by username to start a new conversation.</p></div><ArrowLeft size={17} className="discover-arrow" /></div>
      </section>

      <section className="chat-panel">
        <header className="chat-header"><button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button><button className="chat-person chat-person-button" onClick={() => setDetailsOpen((current) => !current)} aria-label="Toggle contact details"><Avatar initials={activeConversation.avatar} color={activeConversation.color} /><div><h2>{activeConversation.name}</h2><p><span className={`online-dot ${isOnline && activeConversation.online ? '' : 'offline-dot'}`} /> {isOnline && activeConversation.online ? 'Active now' : 'Offline'}</p></div></button><div className="chat-actions"><button className="icon-button" onClick={() => setCallMode('voice')} aria-label="Start voice call"><Phone size={19} /></button><button className="icon-button" onClick={() => setCallMode('video')} aria-label="Start video call"><Video size={20} /></button><button className="icon-button" onClick={() => setDetailsOpen((current) => !current)} aria-label="Toggle contact details"><MoreHorizontal size={21} /></button></div></header>
        <div className="chat-body"><div className="chat-date"><span>Today</span></div><div className="message-stack">{messages.map((item) => <div className={`message-row ${item.mine ? 'mine' : ''}`} key={item.id}>{!item.mine && <Avatar initials={activeConversation.avatar} color={activeConversation.color} size="small" />}<div className="message-bubble">{item.image && <img className="message-image" src={item.image} alt="Shared in chat" />} {item.text && <p>{item.text}</p>}<div className="message-time">{item.time} {item.mine && <CheckCheck size={14} />}</div></div></div>)}</div><div className="typing-indicator"><span className="typing-avatar">M</span><span className="typing-dots"><i /><i /><i /></span><small>Mia is typing...</small></div></div>
        <div className="composer"><div className="composer-tools"><button className="icon-button" aria-label="Attach file"><Paperclip size={19} /></button><button className="icon-button" onClick={() => imageInput.current?.click()} aria-label="Send image"><Image size={19} /></button><button className="icon-button" aria-label="Add emoji"><Smile size={19} /></button><input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => { void sendImage(event.target.files?.[0]); event.currentTarget.value = '' }} /></div><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendMessage() }} placeholder="Write a message..." aria-label="Message" /><button className="send-button" onClick={sendMessage} aria-label="Send message"><Send size={17} /></button></div>
      </section>

      {detailsOpen && <aside className="details-panel"><div className="details-heading"><span>Contact details</span><button className="icon-button" onClick={() => setDetailsOpen(false)} aria-label="Close contact details"><X size={18} /></button></div><div className="contact-profile"><Avatar initials={activeConversation.avatar} color={activeConversation.color} size="large" /><h2>{activeConversation.name}</h2><p>{activeConversation.handle}</p><span className="profile-status"><span className={`online-dot ${isOnline && activeConversation.online ? '' : 'offline-dot'}`} /> {isOnline && activeConversation.online ? 'Available to chat' : 'Offline'}</span></div><div className="quick-actions"><button onClick={() => setCallMode('voice')}><Phone size={18} /><span>Call</span></button><button onClick={() => setCallMode('video')}><Video size={18} /><span>Video</span></button><button onClick={() => setShowProfile(true)}><UserRound size={18} /><span>Profile</span></button></div><div className="detail-section"><div className="section-title"><strong>Shared media</strong><button>See all</button></div><div className="media-grid"><div className="media-tile media-one" /><div className="media-tile media-two" /><div className="media-tile media-three" /></div></div><div className="detail-section"><div className="section-title"><strong>Shared files</strong><button>See all</button></div><div className="file-row"><div className="file-icon"><FileText size={18} /></div><span><strong>project-notes.pdf</strong><small>2.4 MB · May 12</small></span><MoreHorizontal size={17} /></div></div></aside>}

      {search && <div className="search-popover"><div className="search-popover-heading"><strong>Search people</strong><button onClick={() => setSearch('')} aria-label="Close search"><X size={17} /></button></div>{filteredPeople.map((person) => <button key={person.handle} className="person-result" onClick={() => { setActiveId(person.name === 'Mia Anderson' ? 'mia' : 'mia'); setSearch('') }}><Avatar initials={person.avatar} color={person.color} size="small" /><span><strong>{person.name}</strong><small>{person.handle} · {person.meta}</small></span><ArrowLeft size={16} /></button>)}{filteredPeople.length === 0 && <p className="empty-search">No people found for “{search}”.</p>}</div>}
      <div className="global-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find someone by username" aria-label="Find someone by username" /><button onClick={() => setSearch('')} aria-label="Close search"><X size={16} /></button></div>

      {callMode && <div className="call-overlay"><div className="call-background"><div className="call-topbar"><span className="call-secure"><Check size={15} /> Encrypted call</span><button className="call-close" onClick={() => setCallMode(null)} aria-label="End call"><X size={20} /></button></div><div className="call-person"><Avatar initials={activeConversation.avatar} color={activeConversation.color} size="large" /><h2>{activeConversation.name}</h2><p>{callMode === 'video' ? 'Video calling' : 'Calling'} · 00:08</p></div><div className="call-local-video"><Camera size={19} /><span>You</span></div><div className="call-controls"><button aria-label="Mute microphone"><Mic size={21} /></button>{callMode === 'video' && <button aria-label="Turn off camera"><Video size={21} /></button>}<button className="end-call" onClick={() => setCallMode(null)} aria-label="End call"><Phone size={22} /></button><button aria-label="More call options"><MoreHorizontal size={22} /></button></div></div></div>}
      {showProfile && <div className="modal-backdrop" onClick={() => setShowProfile(false)}><div className="profile-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Your profile</p><h2>Make it yours</h2></div><button className="icon-button" onClick={() => setShowProfile(false)} aria-label="Close profile"><X size={19} /></button></div><div className="profile-upload"><div className="profile-photo"><Avatar initials="AR" color="plum" size="large" /><button aria-label="Change profile image"><Camera size={16} /></button></div><div><strong>Profile image</strong><p>Show people who they’re talking to.</p></div></div><label>Username<input defaultValue="alex.rivera" /></label><div className="form-grid"><label>First name<input defaultValue="Alex" /></label><label>Last name<input defaultValue="Rivera" /></label></div><label>Age<input defaultValue="28" type="number" /></label><button className="save-profile" onClick={() => setShowProfile(false)}><Check size={17} /> Save profile</button></div></div>}
    </main>
  )
}

export default App
