import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from './api'
import './monetization.css'
import type { User } from './types'

type Trigger = 'time' | 'activity'
type Decision = 'accepted' | 'declined' | null

const DEFAULT_DELAY_MS = 120_000
const DEFAULT_ACTIVITY_THRESHOLD = 6

function envNumber(name: 'VITE_AD_DELAY_MS' | 'VITE_AD_ACTIVITY_THRESHOLD', fallback: number) {
  const raw = import.meta.env[name]
  const value = raw ? Number(raw) : NaN
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function MonetizationExperiment({ currentUser }: { currentUser: User }) {
  const delayMs = useMemo(() => envNumber('VITE_AD_DELAY_MS', DEFAULT_DELAY_MS), [])
  const activityThreshold = useMemo(
    () => envNumber('VITE_AD_ACTIVITY_THRESHOLD', DEFAULT_ACTIVITY_THRESHOLD),
    [],
  )
  const startedAt = useRef(Date.now())
  const activityCount = useRef(0)
  const triggered = useRef(false)
  const [showAd, setShowAd] = useState(false)
  const [showOffer, setShowOffer] = useState(false)
  const [decision, setDecision] = useState<Decision>(null)
  const [teaserOpened, setTeaserOpened] = useState(false)

  const adShownKey = `agroconnect.stage14.ad-shown.${currentUser.id}`
  const teaserShownKey = `agroconnect.stage14.teaser-shown.${currentUser.id}`

  useEffect(() => {
    if (!sessionStorage.getItem(teaserShownKey)) {
      sessionStorage.setItem(teaserShownKey, '1')
      void api.trackMonetization(currentUser.id, 'premium_teaser_shown', {
        placement: 'feed',
        teaser: 'farm_analytics',
      })
    }
  }, [currentUser.id, teaserShownKey])

  useEffect(() => {
    if (sessionStorage.getItem(adShownKey)) return

    function triggerAd(trigger: Trigger) {
      if (triggered.current || sessionStorage.getItem(adShownKey)) return
      triggered.current = true
      sessionStorage.setItem(adShownKey, '1')
      setShowAd(true)
      void api.trackMonetization(currentUser.id, 'ad_impression', {
        campaign: 'seeder_agrosev_42',
        trigger,
        activity_count: activityCount.current,
        elapsed_ms: Date.now() - startedAt.current,
      })
    }

    const timer = window.setTimeout(() => triggerAd('time'), delayMs)
    const onActivity = () => {
      activityCount.current += 1
      if (activityCount.current >= activityThreshold) triggerAd('activity')
    }

    document.addEventListener('pointerdown', onActivity, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onActivity, true)
    }
  }, [activityThreshold, adShownKey, currentUser.id, delayMs])

  function openTeaser() {
    setTeaserOpened(true)
    void api.trackMonetization(currentUser.id, 'premium_teaser_clicked', {
      placement: 'feed',
      teaser: 'farm_analytics',
    })
  }

  function closeAd() {
    setShowAd(false)
    void api.trackMonetization(currentUser.id, 'ad_closed', {
      campaign: 'seeder_agrosev_42',
    })
    setShowOffer(true)
    void api.trackMonetization(currentUser.id, 'ad_free_offer_shown', {
      plan: 'agroconnect_plus_ad_free',
      source: 'ad_close',
    })
  }

  function decide(next: Exclude<Decision, null>) {
    setDecision(next)
    setShowOffer(false)
    void api.trackMonetization(
      currentUser.id,
      next === 'accepted' ? 'ad_free_offer_accepted' : 'ad_free_offer_declined',
      {
        plan: 'agroconnect_plus_ad_free',
        price_rub_month: 299,
        source: 'ad_close',
      },
    )
  }

  return (
    <>
      <button type="button" className="premium-teaser-card" onClick={openTeaser}>
        <span className="premium-teaser-badge">Plus · скоро</span>
        <strong>Расширенная аналитика хозяйства</strong>
        <small>Сравнение сезонов, рисков и эффективности полей. Проверяем интерес до разработки.</small>
        <span className="premium-teaser-action">Попробовать →</span>
      </button>

      {teaserOpened && (
        <div className="experiment-inline-note" role="status">
          Расширенная аналитика пока в разработке. Интерес к функции зафиксирован для продуктовой гипотезы.
          <button type="button" onClick={() => setTeaserOpened(false)}>Закрыть</button>
        </div>
      )}

      {showAd && (
        <div className="ad-backdrop" role="dialog" aria-modal="true" aria-label="Реклама сеялки">
          <article className="seeder-ad-card">
            <button type="button" className="ad-close" aria-label="Закрыть рекламу" onClick={closeAd}>×</button>
            <div className="ad-label">Реклама · тестовый креатив</div>
            <div className="seeder-ad-layout">
              <div className="seeder-visual" aria-hidden="true">
                <div className="seeder-hopper">AGRO</div>
                <div className="seeder-frame" />
                <div className="seeder-discs">● ● ● ● ● ●</div>
              </div>
              <div>
                <h2>Сеялка «АгроСев 4.2»</h2>
                <p>Точный высев, контроль секций и стабильная глубина на неоднородных полях.</p>
                <div className="ad-price">от 1 890 000 ₽</div>
                <span className="ad-cta">Подробнее у дилера</span>
              </div>
            </div>
          </article>
        </div>
      )}

      {showOffer && (
        <div className="ad-backdrop" role="dialog" aria-modal="true" aria-label="Предложение AgroConnect Plus">
          <article className="ad-free-offer-card">
            <span className="premium-teaser-badge">AgroConnect Plus</span>
            <h2>Убрать рекламу?</h2>
            <p>Без рекламных вставок в AgroConnect за <strong>299 ₽/мес</strong>.</p>
            <button type="button" className="primary-button full-width" onClick={() => decide('accepted')}>
              Подключить без рекламы
            </button>
            <button type="button" className="secondary-button full-width" onClick={() => decide('declined')}>
              Не сейчас
            </button>
            <small>Это тест платежного интереса: списаний и реального подключения в MVP нет.</small>
          </article>
        </div>
      )}

      {decision === 'accepted' && (
        <div className="experiment-inline-note success" role="status">
          Интерес к платному отключению рекламы зафиксирован. Оплата в MVP не производится.
          <button type="button" onClick={() => setDecision(null)}>Закрыть</button>
        </div>
      )}
    </>
  )
}
