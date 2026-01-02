import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type Profile = {
  id: string
  name: string
  codexHome: string
  createdAt: string
}

type ProfileStoreState = {
  profiles: Profile[]
}

export class ProfileStore {
  private readonly metadataPath: string
  private state: ProfileStoreState = { profiles: [] }

  constructor(
    private readonly dataDir: string,
    private readonly profilesDir: string
  ) {
    this.metadataPath = join(this.dataDir, 'profiles.json')
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    await mkdir(this.profilesDir, { recursive: true })
    try {
      const raw = await readFile(this.metadataPath, 'utf8')
      const parsed = JSON.parse(raw) as ProfileStoreState
      this.state = {
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      }
    } catch {
      await this.persist()
    }
  }

  list(): Profile[] {
    return [...this.state.profiles]
  }

  get(profileId: string): Profile | undefined {
    return this.state.profiles.find((profile) => profile.id === profileId)
  }

  async create(name?: string): Promise<Profile> {
    const id = randomUUID()
    const codexHome = join(this.profilesDir, id)
    await mkdir(codexHome, { recursive: true })

    const profile: Profile = {
      id,
      name: name?.trim() || `Profile ${this.state.profiles.length + 1}`,
      codexHome,
      createdAt: new Date().toISOString(),
    }

    this.state.profiles.push(profile)
    await this.persist()
    return profile
  }

  async ensureDefault(defaultCodexHome: string): Promise<Profile> {
    const existing = this.state.profiles.find(
      (profile) => profile.codexHome === defaultCodexHome
    )
    if (existing) {
      return existing
    }

    const id = this.state.profiles.some((profile) => profile.id === 'default')
      ? randomUUID()
      : 'default'

    const profile: Profile = {
      id,
      name: 'Default',
      codexHome: defaultCodexHome,
      createdAt: new Date().toISOString(),
    }

    this.state.profiles.unshift(profile)
    await this.persist()
    return profile
  }

  async rename(profileId: string, name: string): Promise<Profile | undefined> {
    const profile = this.get(profileId)
    if (!profile) {
      return undefined
    }
    profile.name = name
    await this.persist()
    return profile
  }

  async remove(profileId: string): Promise<boolean> {
    const next = this.state.profiles.filter((profile) => profile.id !== profileId)
    if (next.length === this.state.profiles.length) {
      return false
    }
    this.state.profiles = next
    await this.persist()
    return true
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.metadataPath), { recursive: true })
    await writeFile(this.metadataPath, JSON.stringify(this.state, null, 2))
  }
}
