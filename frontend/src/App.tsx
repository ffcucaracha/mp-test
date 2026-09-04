import { useEffect, useMemo, useState } from 'react'

type User = {
  id: number
  name: string
  username: string
  location: string
  farm: string
  bio: string
}

type Post = {
  id: number
  text: string
  created_at: string
  author: User
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type Screen = 'feed' | 'profile'

export default function App() {
  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => {
    const saved = localStorage.getItem('agroconnect.userId')
    return saved ? Number(saved) : null
  })
  const [screen, setScreen] = useState<Screen>('feed')
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/health`).then((response) => {
        if (!response.ok) throw new Error('health check failed')
        return response.json()
      }),
      fetch(`${API_URL}/api/users`).then((response) => response.json()),
      fetch(`${API_URL}/api/posts`).then((response) => response.json()),
    ])
      .then(([, usersData, postsData]) => {
        setServerOk(true)
        setUsers(usersData)
        setPosts(postsData)
      })
      .catch(() => setServerOk(false))
      .finally(() => setLoading(false))
  }, [])

  const currentUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  )

  function login(userId: number) {
    localStorage.setItem('agroconnect.userId', String(userId))
    setSelectedUserId(userId)
    setScreen('feed')
  }

  function logout() {
    localStorage.removeItem('agroconnect.userId')
    setSelectedUserId(null)
    setScreen('feed')
  }

  if (loading) {
    return <div className="center-screen">Загрузка AgroConnect…</div>
  }

  if (!currentUser) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-mark">AC</div>
          <h1>AgroConnect</h1>
          <p className="muted">MVP мобильной сети для фермеров</p>
          <div className={`server-status ${serverOk ? 'ok' : 'error'}`}>
            <span className="status-dot" />
            {serverOk ? 'Сервер доступен' : 'Нет связи с сервером'}
          </div>

          <h2>Выберите тестового пользователя</h2>
          <div className="user-list">
            {users.map((user) => (
              <button key={user.id} className="user-option" onClick={() => login(user.id)}>
                <Avatar name={user.name} />
                <span>
                  <strong>{user.name}</strong>
                  <small>@{user.username} · {user.location}</small>
                </span>
                <span className="chevron">›</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>AgroConnect</strong>
          <small>{screen === 'feed' ? 'Лента' : 'Профиль'}</small>
        </div>
        <div className="topbar-user">
          <Avatar name={currentUser.name} small />
        </div>
      </header>

      <main className="content">
        {screen === 'feed' ? (
          <section>
            <div className="composer teaser">
              <Avatar name={currentUser.name} />
              <div>
                <strong>Что происходит в хозяйстве?</strong>
                <p>Создание поста добавим следующим шагом.</p>
              </div>
            </div>

            <div className="feed">
              {posts.map((post) => (
                <article className="post" key={post.id}>
                  <Avatar name={post.author.name} />
                  <div className="post-body">
                    <div className="post-meta">
                      <strong>{post.author.name}</strong>
                      <span>@{post.author.username}</span>
                    </div>
                    <p>{post.text}</p>
                    <div className="post-actions">
                      <span>♡ 0</span>
                      <span>💬 0</span>
                      <span>↗</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="profile">
            <div className="profile-cover" />
            <div className="profile-head">
              <Avatar name={currentUser.name} large />
              <button className="secondary-button" onClick={logout}>Сменить пользователя</button>
            </div>
            <h1>{currentUser.name}</h1>
            <div className="username">@{currentUser.username}</div>
            <p className="bio">{currentUser.bio}</p>
            <div className="profile-info">
              <div><span>Регион</span><strong>{currentUser.location}</strong></div>
              <div><span>Хозяйство</span><strong>{currentUser.farm}</strong></div>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <button className={screen === 'feed' ? 'active' : ''} onClick={() => setScreen('feed')}>
          <span>⌂</span>
          Лента
        </button>
        <button className={screen === 'profile' ? 'active' : ''} onClick={() => setScreen('profile')}>
          <span>○</span>
          Профиль
        </button>
      </nav>
    </div>
  )
}

function Avatar({ name, small = false, large = false }: { name: string; small?: boolean; large?: boolean }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)

  const className = ['avatar', small ? 'small' : '', large ? 'large' : ''].filter(Boolean).join(' ')
  return <div className={className}>{initials}</div>
}
