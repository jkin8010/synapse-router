import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useColorMode from '@theme/hooks/useColorMode';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  const {colorMode} = useColorMode();
  const isDark = colorMode === 'dark';

  return (
    <header
      className={clsx(styles.heroBanner, isDark ? styles.heroBannerDark : styles.heroBannerLight)}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          Synapse Router
        </Heading>
        <p className={styles.heroTagline}>{siteConfig.tagline}</p>
        <p className={styles.heroDescription}>
          开发时协商，运行时无感 — 让每次 AI API 调用都有明确契约
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/intro">
            Get Started
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://github.com/qise-tech/synapse-router">
            View on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}): ReactNode {
  return (
    <div className="col col--4">
      <div className={styles.featureCard}>
        <Heading as="h3" className={styles.featureTitle}>
          {title}
        </Heading>
        <p className={styles.featureDescription}>{description}</p>
      </div>
    </div>
  );
}

const features = [
  {
    title: 'Schema 协商',
    description:
      'Intent 匹配 + 能力验证 + 字段级 Manifest 约束检查',
  },
  {
    title: '多 Provider 路由',
    description:
      '5 种内置策略 + 自定义权重向量，确定性能选出最优 Provider',
  },
  {
    title: '零依赖 SDK',
    description:
      '开发时完成所有决策，运行时只有纯代码，零 Token 成本',
  },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="AI Agent 的受控 Schema 协商与多 Provider 路由层">
      <HomepageHeader />
      <main>
        <section className={styles.featuresSection}>
          <div className="container">
            <div className="row">
              {features.map((feature, idx) => (
                <FeatureCard key={idx} {...feature} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
