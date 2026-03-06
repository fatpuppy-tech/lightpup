import type { ReactComponent } from '../types'
import {
  RedisIcon,
  PostgresIcon,
  MysqlIcon,
  MongoDBIcon,
  GrafanaIcon,
  PrometheusIcon,
  NginxIcon,
  TraefikIcon,
  MinioIcon,
  RabbitMQIcon,
  PlexIcon,
  HomeAssistantIcon,
  PortainerIcon,
  AdGuardIcon,
  NextcloudIcon,
  VaultwardenIcon,
  UptimeKumaIcon,
  WordPressIcon,
  GhostIcon,
  RegistryIcon,
  StrapiIcon,
  DirectusIcon,
} from '../components/icons'

export type AppPreset = {
  id: string
  name: string
  image: string
  defaultPort: number
  description: string
  category: AppCategory
  Icon: ReactComponent<{ className?: string }>
}

export type AppCategory = 'database' | 'monitoring' | 'proxy' | 'storage' | 'media' | 'home' | 'cms' | 'security' | 'other'

export type AppCategoryInfo = {
  id: AppCategory
  label: string
}

export const APP_CATEGORIES: AppCategoryInfo[] = [
  { id: 'database', label: 'Databases' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'proxy', label: 'Proxy & Web' },
  { id: 'storage', label: 'Storage & Sync' },
  { id: 'media', label: 'Media' },
  { id: 'home', label: 'Home Automation' },
  { id: 'security', label: 'Security' },
  { id: 'cms', label: 'CMS & Blog' },
  { id: 'other', label: 'Other' },
]

export const APP_PRESETS: AppPreset[] = [
  // Databases
  { id: 'redis', name: 'Redis', image: 'redis:alpine', defaultPort: 6379, description: 'In-memory data store', category: 'database', Icon: RedisIcon },
  { id: 'postgres', name: 'PostgreSQL', image: 'postgres:16-alpine', defaultPort: 5432, description: 'Relational database', category: 'database', Icon: PostgresIcon },
  { id: 'mysql', name: 'MySQL', image: 'mysql:8', defaultPort: 3306, description: 'MySQL database', category: 'database', Icon: MysqlIcon },
  { id: 'mongodb', name: 'MongoDB', image: 'mongo:7', defaultPort: 27017, description: 'NoSQL database', category: 'database', Icon: MongoDBIcon },
  { id: 'mariadb', name: 'MariaDB', image: 'mariadb:11', defaultPort: 3306, description: 'MySQL fork database', category: 'database', Icon: MysqlIcon },

  // Monitoring
  { id: 'grafana', name: 'Grafana', image: 'grafana/grafana:latest', defaultPort: 3000, description: 'Metrics dashboard', category: 'monitoring', Icon: GrafanaIcon },
  { id: 'prometheus', name: 'Prometheus', image: 'prom/prometheus:latest', defaultPort: 9090, description: 'Metrics collection', category: 'monitoring', Icon: PrometheusIcon },
  { id: 'portainer', name: 'Portainer', image: 'portainer/portainer-ce:latest', defaultPort: 9443, description: 'Container management', category: 'monitoring', Icon: PortainerIcon },
  { id: 'uptimkuma', name: 'Uptime Kuma', image: 'louislam/uptime-kuma:latest', defaultPort: 3001, description: 'Self-hosted monitoring', category: 'monitoring', Icon: UptimeKumaIcon },

  // Proxy & Web
  { id: 'nginx', name: 'Nginx', image: 'nginx:latest', defaultPort: 80, description: 'Web server', category: 'proxy', Icon: NginxIcon },
  { id: 'traefik', name: 'Traefik', image: 'traefik:v3.0', defaultPort: 80, description: 'Reverse proxy', category: 'proxy', Icon: TraefikIcon },

  // Storage
  { id: 'minio', name: 'MinIO', image: 'minio/minio:latest', defaultPort: 9000, description: 'S3-compatible storage', category: 'storage', Icon: MinioIcon },
  { id: 'registry', name: 'Docker Registry', image: 'registry:2', defaultPort: 5000, description: 'Private container registry', category: 'storage', Icon: RegistryIcon },
  { id: 'nextcloud', name: 'Nextcloud', image: 'nextcloud:latest', defaultPort: 80, description: 'File sync & share', category: 'storage', Icon: NextcloudIcon },

  // Media
  { id: 'plex', name: 'Plex', image: 'plexinc/pms-docker:latest', defaultPort: 32400, description: 'Media server', category: 'media', Icon: PlexIcon },
  { id: 'jellyfin', name: 'Jellyfin', image: 'jellyfin/jellyfin:latest', defaultPort: 8096, description: 'Media server', category: 'media', Icon: PlexIcon },

  // Home Automation
  { id: 'homeassistant', name: 'Home Assistant', image: 'homeassistant/home-assistant:stable', defaultPort: 8123, description: 'Home automation', category: 'home', Icon: HomeAssistantIcon },

  // Security
  { id: 'adguard', name: 'AdGuard Home', image: 'adguard/adguardhome:latest', defaultPort: 3000, description: 'DNS ad blocker', category: 'security', Icon: AdGuardIcon },
  { id: 'vaultwarden', name: 'Vaultwarden', image: 'vaultwarden/server:latest', defaultPort: 80, description: 'Password manager', category: 'security', Icon: VaultwardenIcon },

  // CMS
  { id: 'wordpress', name: 'WordPress', image: 'wordpress:latest', defaultPort: 80, description: 'CMS platform', category: 'cms', Icon: WordPressIcon },
  { id: 'ghost', name: 'Ghost', image: 'ghost:5-alpine', defaultPort: 2368, description: 'Publishing platform', category: 'cms', Icon: GhostIcon },
  { id: 'strapi', name: 'Strapi', image: 'strapi/strapi:latest', defaultPort: 1337, description: 'Headless CMS', category: 'cms', Icon: StrapiIcon },
  { id: 'directus', name: 'Directus', image: 'directus/directus:latest', defaultPort: 8055, description: 'Headless CMS', category: 'cms', Icon: DirectusIcon },

  // Other
  { id: 'rabbitmq', name: 'RabbitMQ', image: 'rabbitmq:3-management', defaultPort: 5672, description: 'Message broker', category: 'other', Icon: RabbitMQIcon },
]

export function getPresetsByCategory(category: AppCategory): AppPreset[] {
  return APP_PRESETS.filter(p => p.category === category)
}

export function findPresetById(id: string): AppPreset | undefined {
  return APP_PRESETS.find(p => p.id === id)
}

export function searchPresets(query: string): AppPreset[] {
  const lower = query.toLowerCase()
  return APP_PRESETS.filter(p => 
    p.name.toLowerCase().includes(lower) || 
    p.description.toLowerCase().includes(lower)
  )
}
