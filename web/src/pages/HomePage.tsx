import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, Camera, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Lightbox } from '@/components/content/Lightbox'
import { MediaTile } from '@/components/content/MediaGrid'
import { PostCard } from '@/components/content/PostCard'
import { UploadDialog } from '@/components/content/UploadDialog'
import { Button, buttonClass } from '@/components/ui/Button'
import { Avatar, EmptyState, PageLoading, SectionTitle } from '@/components/ui/Display'
import { api, mediaUrl } from '@/lib/api'
import { formatCount, toImageList } from '@/lib/utils'
import { useAuth } from '@/store/auth'

const fade = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
}

export function HomePage() {
  const user = useAuth((state) => state.user)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const home = useQuery({ queryKey: ['home'], queryFn: api.site.home, staleTime: 60_000 })

  if (home.isLoading) return <PageLoading label="正在打捞旧时光…" />
  if (home.isError || !home.data) {
    return (
      <EmptyState
        title="没能把页面捞上来"
        description="可能是后端还没启动，或者网络不太稳。刷新一下试试。"
        action={
          <button type="button" onClick={() => home.refetch()} className={buttonClass('outline', 'sm')}>
            重试
          </button>
        }
      />
    )
  }

  const { config, stats, albums, posts, media, villagers, timeline } = home.data
  const site = config.site
  const articles = posts.filter((post) => post.kind === 'article')
  const shorts = posts.filter((post) => post.kind === 'short')
  // 后台没配首页大图时，用仓库里预置的村庄照片兜底，第一屏不至于空着
  const heroImage =
    mediaUrl(toImageList(site.hero_images)[0] || '') || '/assets/village/hero-01-panorama-1280.webp'

  return (
    <div className="space-y-16 pb-4 sm:space-y-20">
      {/* ------------------------------------------------------------ 首屏 */}
      <section className="relative overflow-hidden rounded-[24px] border border-line bg-[#fffdf9] shadow-soft">
        {heroImage && (
          <div className="absolute inset-0">
            <img src={heroImage} alt="" className="size-full object-cover opacity-[0.18]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#fffdf9] via-[#fffdf9]/90 to-transparent" />
          </div>
        )}
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 82% 18%, rgba(180,121,63,0.10), transparent 46%), radial-gradient(circle at 12% 82%, rgba(107,127,94,0.08), transparent 42%)',
          }}
          aria-hidden
        />

        <div className="relative grid gap-10 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-14">
          <div>
            <motion.div {...fade}>
              <div className="mb-5 flex items-center gap-3">
                <span className="h-px w-8 bg-clay/50" />
                <span className="text-[10.5px] font-medium uppercase tracking-[0.3em] text-clay">
                  浙江 · 衢州 · 柯城 · 白云街道
                </span>
              </div>
              <h1 className="max-w-2xl text-balance font-serif text-[40px] leading-[1.2] tracking-[0.14em] text-ink sm:text-[56px]">
                {(site.title || '过溪畈 · 老村记忆').split(/[·・|]/)[0].trim() || '过溪畈'}
              </h1>
              <p className="mt-3 font-serif text-[17px] leading-relaxed tracking-[0.06em] text-clay-deep sm:text-[19px]">
                {site.subtitle || '过了溪，就是田畈。'}
              </p>
              <p className="mt-4 max-w-xl text-[13.5px] leading-[1.95] text-ink-soft sm:text-[14.5px]">
                {site.description ||
                  '一条小溪，一片田畈，314 户人家。村子要拆了，我们把照片、名字和故事留在这里。'}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {user ? (
                  <Button size="md" icon={<Camera className="size-4" />} onClick={() => setUploadOpen(true)}>
                    传一张老照片
                  </Button>
                ) : (
                  <Link to="/register" className={buttonClass('primary', 'md', 'gap-1.5')}>
                    <Camera className="size-4" />
                    传一张老照片
                  </Link>
                )}
                <Link to="/albums" className={buttonClass('outline', 'md', 'gap-1.5')}>
                  先去照片墙看看
                </Link>
                <Link
                  to="/articles"
                  className="text-[12.5px] text-ink-mute underline-offset-4 transition-colors hover:text-clay-deep hover:underline"
                >
                  或读一篇村史
                </Link>
              </div>
            </motion.div>

            <motion.dl
              {...fade}
              transition={{ ...fade.transition, delay: 0.12 }}
              className="mt-12 grid max-w-lg grid-cols-2 gap-x-6 gap-y-4 border-t border-line/80 pt-6 sm:grid-cols-4"
            >
              {[
                { label: '影像', value: stats.media, unit: '张' },
                { label: '文章', value: stats.posts, unit: '篇' },
                { label: '村民', value: stats.villagers, unit: '位' },
                { label: '人家', value: stats.families, unit: '户' },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[10.5px] uppercase tracking-[0.22em] text-ink-mute">{item.label}</dt>
                  <dd className="mt-1 font-serif text-[22px] text-ink">
                    {formatCount(item.value)}
                    <span className="ml-1 text-[11px] font-sans text-ink-mute">{item.unit}</span>
                  </dd>
                </div>
              ))}
            </motion.dl>
          </div>

          <motion.figure
            {...fade}
            transition={{ ...fade.transition, delay: 0.18 }}
            className="hidden lg:block"
          >
            <div className="overflow-hidden rounded-[16px] border border-line/80 shadow-lift">
              <img
                src={heroImage}
                alt="过溪畈的老样子"
                className="aspect-[4/5] w-full object-cover"
                loading="eager"
              />
            </div>
            <figcaption className="mt-3 flex items-center justify-between text-[10.5px] tracking-[0.18em] text-ink-mute">
              <span>过溪畈 · 官庄畈 · 蓬上</span>
              <span className="text-red-paper/80">2026 拆迁</span>
            </figcaption>
          </motion.figure>
        </div>
      </section>

      {/* ------------------------------------------------------------ 拆迁纪念带 */}
      <section className="-mt-6 border-y border-line/70 py-6 text-center sm:-mt-10">
        <p className="font-serif text-[14px] tracking-[0.08em] text-ink-soft sm:text-[15px]">
          {String(site.demolition_date ?? '').slice(0, 4) || '2026'} 年，村子启动拆迁
          <span className="mx-2 text-line">·</span>
          314 户人家
          <span className="mx-2 text-line">·</span>
          728 位村民
          <span className="mx-2 text-line">·</span>
          3 个自然村
        </p>
        <p className="mt-2 text-[11.5px] tracking-wide text-ink-mute">
          溪还在，畈没了。<span className="mx-1.5 text-line">|</span>记录仍在继续
        </p>
      </section>

      {/* ------------------------------------------------------------ 最新影像 */}
      <section>
        <SectionTitle
          eyebrow="Latest"
          title="村里最近传上来的"
          action={
            <Link
              to="/albums"
              className="inline-flex items-center gap-1 text-[12.5px] text-ink-mute transition-colors hover:text-clay-deep"
            >
              去照片墙
              <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        {media.length > 0 ? (
          <>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
              {media.slice(0, 8).map((item, index) => (
                <MediaTile
                  key={item.id}
                  media={item}
                  priority={index < 4}
                  className="w-[62%] shrink-0 snap-start sm:w-auto"
                  onOpen={() => setLightboxIndex(index)}
                />
              ))}
            </div>
            <Lightbox
              items={media.slice(0, 8)}
              index={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
              onIndexChange={setLightboxIndex}
            />
          </>
        ) : (
          <EmptyState
            title="还是空的"
            description="你手机里那张村口的老照片，就是第一张。"
            action={
              user ? (
                <button type="button" onClick={() => setUploadOpen(true)} className={buttonClass('quiet', 'sm')}>
                  传第一张
                </button>
              ) : undefined
            }
          />
        )}

        {albums.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {albums.slice(0, 3).map((album) => (
              <Link
                key={album.id}
                to={`/albums/${album.id}`}
                className="group relative overflow-hidden rounded-xl border border-line bg-[#fffdf9] px-4 py-3 transition-all duration-300 hover:border-clay/40 hover:shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <div className="font-serif text-[15px] text-ink">{album.title}</div>
                  <span className="text-[11px] text-ink-mute">{album.media_count}</span>
                </div>
                <div className="mt-1 line-clamp-1 text-[11.5px] text-ink-mute">
                  {album.description || album.era || '一册旧时光'}
                </div>
                <div className="mt-3 flex gap-1">
                  {(album.samples ?? []).slice(0, 3).map((sample, index) =>
                    sample ? (
                      <img
                        key={index}
                        src={mediaUrl(sample)}
                        alt=""
                        loading="lazy"
                        className="h-12 w-16 rounded object-cover"
                      />
                    ) : null,
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ 文章 */}
      {articles.length > 0 && (
        <section>
          <SectionTitle
            eyebrow="Stories"
            title="村里的事"
            action={
              <Link
                to="/articles"
                className="inline-flex items-center gap-1 text-[12.5px] text-ink-mute transition-colors hover:text-clay-deep"
              >
                更多
                <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {articles.slice(0, 3).map((post) => (
              <PostCard key={post.id} post={post} variant="grid" />
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ 短句 */}
      {shorts.length > 0 && (
        <motion.section {...fade}>
          <SectionTitle
            eyebrow="Notes"
            title="三言两语"
            action={
              <Link
                to="/shorts"
                className="inline-flex items-center gap-1 text-[12.5px] text-ink-mute transition-colors hover:text-clay-deep"
              >
                全部
                <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {shorts.slice(0, 3).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </motion.section>
      )}

      {/* ------------------------------------------------------------ 村史 + 村民 */}
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        {timeline.length > 0 && (
          <motion.section {...fade}>
            <SectionTitle
              eyebrow="Chronicle"
              title="村史 · 一年一年记"
              action={
                <Link
                  to="/timeline"
                  className="inline-flex items-center gap-1 text-[12.5px] text-ink-mute transition-colors hover:text-clay-deep"
                >
                  完整年表
                  <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <ol className="relative space-y-5 border-l border-line pl-5">
              {timeline.slice(0, 5).map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[25px] top-1.5 size-2 rounded-full border border-clay bg-paper" />
                  <div className="font-serif text-[12.5px] tracking-widest text-clay">{event.year_label}</div>
                  <div className="mt-0.5 text-[14px] text-ink">{event.title}</div>
                  {event.description && (
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-mute">
                      {event.description}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </motion.section>
        )}

        <motion.section {...fade}>
          <SectionTitle
            eyebrow="Villagers"
            title="村里的人"
            action={
              <Link
                to="/villagers"
                className="inline-flex items-center gap-1 text-[12.5px] text-ink-mute transition-colors hover:text-clay-deep"
              >
                村民名录
                <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {villagers.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {villagers.slice(0, 6).map((villager) => (
                <Link
                  key={villager.id}
                  to={`/villagers/${villager.id}`}
                  className="group flex items-center gap-2.5 rounded-xl border border-line/80 bg-[#fffdf9]/80 px-3 py-2.5 transition-all duration-300 hover:border-clay/40 hover:shadow-soft"
                >
                  <Avatar src={villager.avatar_url} name={villager.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-serif text-[13.5px] text-ink">{villager.name}</span>
                    <span className="block truncate text-[10.5px] text-ink-mute">
                      {villager.family?.name || villager.generation || '村民'}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="名录还空着" description="把你记得的名字写下来，就从自家开始。" className="py-10" />
          )}
        </motion.section>
      </div>

      {/* ------------------------------------------------------------ 聊天 */}
      <section className="relative overflow-hidden rounded-card border border-line bg-[#fcf8f0] px-6 py-9 text-center sm:px-12">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 120%, rgba(180,121,63,0.14), transparent 60%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <MessageCircle className="mx-auto size-5 text-clay/70" />
          <h2 className="mt-3 font-serif text-xl text-ink">村口的老樟树底下，总有人在说话</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-mute">
            搬走了也还是一个村的人。发张照片，说句闲话，或者只是看看别人在聊什么。
          </p>
          <Link to="/chat" className={buttonClass('primary', 'md', 'mt-5')}>
            进聊天室
          </Link>
        </div>
      </section>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} albums={albums} />
    </div>
  )
}
