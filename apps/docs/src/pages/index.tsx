import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Translate from '@docusaurus/Translate';
import Layout from '@theme/Layout';

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Controlled Schema Negotiation and Multi-Provider Routing Layer for AI Agents">
      {/* Hero */}
      <header style={{
        padding: '5rem 1rem 3rem',
        textAlign: 'center',
        borderBottom: '1px solid #27272a',
      }}>
        <div className="container">
          <h1 style={{
            fontSize: '2.75rem',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            color: '#fafafa',
            marginBottom: '0.75rem',
            lineHeight: 1.15,
          }}>
            Synapse Router
          </h1>
          <p style={{
            fontSize: '1.125rem',
            color: '#a1a1aa',
            marginBottom: '0.5rem',
          }}>
            {siteConfig.tagline}
          </p>
          <p style={{
            fontSize: '1rem',
            color: '#71717a',
            marginBottom: '2rem',
            maxWidth: '36rem',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            <Translate>Negotiate at dev time, zero overhead at runtime — every AI API call backed by a clear contract</Translate>
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              className="synapse-button synapse-button--primary"
              to="/docs/intro">
              <Translate>Get Started</Translate> →
            </Link>
            <Link
              className="synapse-button"
              to="https://github.com/qise-tech/synapse-router">
              <Translate>View on GitHub</Translate>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Stats */}
        <section style={{ padding: '2.5rem 1rem' }}>
          <div className="container">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}>
              <div className="synapse-stat">
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>50+</div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#71717a' }}><Translate>Supported Providers</Translate></p>
              </div>
              <div className="synapse-stat">
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>6</div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#71717a' }}><Translate>Routing Strategies</Translate></p>
              </div>
              <div className="synapse-stat">
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>0</div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#71717a' }}><Translate>Runtime Dependencies</Translate></p>
              </div>
              <div className="synapse-stat">
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>100%</div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#71717a' }}><Translate>TypeScript Coverage</Translate></p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section style={{ padding: '2.5rem 1rem 4rem' }}>
          <div className="container">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1rem',
            }}>
              <div className="synapse-card">
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', margin: '0 0 0.5rem' }}><Translate>Schema Negotiation</Translate></h3>
                <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}><Translate>Intent matching + capability verification + field-level Manifest constraint checking. Every API call goes through a predefined contract, eliminating runtime errors.</Translate></p>
              </div>
              <div className="synapse-card">
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', margin: '0 0 0.5rem' }}><Translate>Multi-Provider Routing</Translate></h3>
                <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}><Translate>5 built-in strategies + custom weight vectors. Selects the optimal provider based on latency, cost, and capability matrix scoring.</Translate></p>
              </div>
              <div className="synapse-card">
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', margin: '0 0 0.5rem' }}><Translate>Zero-Dependency SDK</Translate></h3>
                <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}><Translate>All decisions made at dev time. Runtime is pure TypeScript code — zero token cost, zero runtime dependencies, zero surprises.</Translate></p>
              </div>
              <div className="synapse-card">
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', margin: '0 0 0.5rem' }}><Translate>Pack Ecosystem</Translate></h3>
                <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}><Translate>Discover and install Provider Packs through Synapse Registry. One-click access to 50+ AI providers including OpenAI, Claude, DeepSeek, and more.</Translate></p>
              </div>
              <div className="synapse-card">
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', margin: '0 0 0.5rem' }}><Translate>TypeScript First</Translate></h3>
                <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}><Translate>End-to-end type safety — from Provider definitions to SDK generation. Full TypeScript support with complete IDE IntelliSense coverage.</Translate></p>
              </div>
              <div className="synapse-card">
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', margin: '0 0 0.5rem' }}><Translate>Production Ready</Translate></h3>
                <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}><Translate>Built-in retry, circuit breaker, timeout control, billing metering, and secret key management. Production-grade infrastructure out of the box.</Translate></p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
