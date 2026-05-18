import { useTranslation } from 'react-i18next'

export default function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        background: 'var(--color-base)',
        color: 'var(--color-text)',
        padding: '40px',
      }}
    >
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '24px', color: 'var(--color-text)' }}>
          {t('privacy.title')}
        </h1>

        <p style={{ marginBottom: '20px', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          <strong>{t('privacy.lastUpdated')}</strong> {new Date().toLocaleDateString()}
        </p>

        <Section heading={t('privacy.introduction.heading')}>
          <p style={{ marginBottom: '12px' }}>{t('privacy.introduction.p1')}</p>
          <p>{t('privacy.introduction.p2')}</p>
        </Section>

        <Section heading={t('privacy.dataCollection.heading')}>
          <p style={{ marginBottom: '12px' }}>{t('privacy.dataCollection.intro')}</p>
          <ul style={{ lineHeight: 1.8, marginLeft: '20px' }}>
            <li><strong>Navigation Data:</strong> {t('privacy.dataCollection.navData')}</li>
            <li><strong>Browser Data:</strong> {t('privacy.dataCollection.browserData')}</li>
            <li><strong>Local Storage:</strong> {t('privacy.dataCollection.localStorage')}</li>
          </ul>
        </Section>

        <Section heading={t('privacy.dataUsage.heading')}>
          <p style={{ marginBottom: '12px' }}>{t('privacy.dataUsage.intro')}</p>
          <ul style={{ lineHeight: 1.8, marginLeft: '20px' }}>
            <li>{t('privacy.dataUsage.improve')}</li>
            <li>{t('privacy.dataUsage.understand')}</li>
            <li>{t('privacy.dataUsage.analyze')}</li>
            <li>{t('privacy.dataUsage.save')}</li>
          </ul>
        </Section>

        <Section heading={t('privacy.cloudflare.heading')}>
          <p style={{ marginBottom: '12px' }}>{t('privacy.cloudflare.intro')}</p>
          <ul style={{ lineHeight: 1.8, marginLeft: '20px' }}>
            <li>{t('privacy.cloudflare.aggregate')}</li>
            <li>{t('privacy.cloudflare.noCookies')}</li>
            <li>{t('privacy.cloudflare.noIndividual')}</li>
            <li>{t('privacy.cloudflare.dnt')}</li>
          </ul>
          <p style={{ lineHeight: 1.6, marginTop: '12px' }}>
            {t('privacy.cloudflare.more')}{' '}
            <a
              href="https://www.cloudflare.com/analytics/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent-orange)', textDecoration: 'underline' }}
            >
              {t('privacy.cloudflare.cloudflarePolicy')}
            </a>.
          </p>
        </Section>

        <Section heading={t('privacy.storage.heading')}>
          <p style={{ marginBottom: '12px' }}>{t('privacy.storage.p1')}</p>
          <p>{t('privacy.storage.p2')}</p>
        </Section>

        <Section heading={t('privacy.rights.heading')}>
          <p style={{ marginBottom: '12px' }}>{t('privacy.rights.intro')}</p>
          <ul style={{ lineHeight: 1.8, marginLeft: '20px' }}>
            <li>{t('privacy.rights.gdpr')}</li>
            <li>{t('privacy.rights.lgpd')}</li>
          </ul>
        </Section>

        <Section heading={t('privacy.contact.heading')}>
          <p style={{ lineHeight: 1.6 }}>
            {t('privacy.contact.text')}{' '}
            <a
              href="https://github.com/bruno-szdl/analytics-engineering-quest/issues"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent-orange)', textDecoration: 'underline' }}
            >
              GitHub Issues
            </a>.
          </p>
        </Section>

        <div
          style={{
            lineHeight: 1.6,
            color: 'var(--color-text-muted)',
            padding: '16px',
            borderLeft: '3px solid var(--color-accent-orange)',
            backgroundColor: 'rgba(255, 136, 0, 0.05)',
            borderRadius: '4px',
          }}
        >
          {t('privacy.footer')}
        </div>
      </div>
    </div>
  )
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '12px', color: 'var(--color-text)' }}>
        {heading}
      </h2>
      <div style={{ lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
        {children}
      </div>
    </section>
  )
}
