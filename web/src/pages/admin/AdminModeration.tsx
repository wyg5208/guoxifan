import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Flag, MessageSquare, Plus, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, PageHeader, PageLoading } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Form'
import { api } from '@/lib/api'
import { cn, formatRelative, stripHtml } from '@/lib/utils'
import { describeError, toast } from '@/store/toast'

type Tab = 'pending' | 'reports' | 'words'

const TABS: [Tab, string][] = [
  ['pending', '内容待审'],
  ['reports', '举报'],
  ['words', '敏感词'],
]

const REPORT_ACTIONS: { value: 'hide' | 'ignore' | 'warn'; label: string; hint: string }[] = [
  { value: 'hide', label: '隐藏内容', hint: '从站上撤下来' },
  { value: 'ignore', label: '不理它', hint: '举报不成立' },
  { value: 'warn', label: '提醒作者', hint: '记一笔，留个警告' },
]

export function AdminModeration() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'pending'
  const queryClient = useQueryClient()

  const [word, setWord] = useState('')
  const [level, setLevel] = useState('1')

  const pending = useQuery({
    queryKey: ['admin', 'moderation', 'pending'],
    queryFn: api.admin.pending,
    enabled: tab === 'pending',
  })

  const reports = useQuery({
    queryKey: ['admin', 'moderation', 'reports'],
    queryFn: () => api.admin.reports({ status: 'open' }).then((result) => result.data),
    enabled: tab === 'reports',
  })

  const words = useQuery({
    queryKey: ['admin', 'moderation', 'words'],
    queryFn: api.admin.words,
    enabled: tab === 'words',
  })

  const refresh = (scope: Tab) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', scope] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
  }

  const reviewPost = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.admin.reviewPost(id, action),
    onSuccess: (_, variables) => {
      toast.success(variables.action === 'approve' ? '通过了' : '已退回')
      refresh('pending')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const reviewComment = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.admin.reviewComment(id, action),
    onSuccess: (_, variables) => {
      toast.success(variables.action === 'approve' ? '通过了' : '已退回')
      refresh('pending')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'hide' | 'ignore' | 'warn' }) =>
      api.admin.resolveReport(id, action),
    onSuccess: () => {
      toast.success('处理好了')
      refresh('reports')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const addWord = useMutation({
    mutationFn: () => api.admin.addWord(word.trim(), Number(level)),
    onSuccess: () => {
      setWord('')
      toast.success('加进去了')
      refresh('words')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const deleteWord = useMutation({
    mutationFn: (id: string) => api.admin.deleteWord(id),
    onSuccess: () => {
      toast.success('删掉了')
      refresh('words')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const postList = pending.data?.posts ?? []
  const commentList = pending.data?.comments ?? []
  const reportList = reports.data ?? []
  const wordList = words.data ?? []

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="内容审核"
        description="有争议的东西先别急着删，看一眼再定。"
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => {
              pending.refetch()
              reports.refetch()
            }}
          >
            刷新
          </Button>
        }
      >
        <div className="mt-5 flex flex-wrap gap-2">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setParams(value === 'pending' ? {} : { tab: value })}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors',
                tab === value ? 'bg-clay/12 text-clay-deep' : 'text-ink-soft hover:bg-paper-2',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {tab === 'pending' && (
        <>
          {pending.isLoading ? (
            <PageLoading label="正在看有哪些要审…" />
          ) : postList.length === 0 && commentList.length === 0 ? (
            <EmptyState
              icon={<Check className="size-6" />}
              title="这阵子没有要审的"
              description="清爽。要么没人发，要么上一批都处理完了。"
            />
          ) : (
            <div className="space-y-8">
              {postList.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 font-serif text-[16px] text-ink">
                    <MessageSquare className="size-4 text-clay" />
                    文章与短文 <span className="text-[12px] text-ink-mute">{postList.length} 篇</span>
                  </h2>
                  <div className="space-y-2">
                    {postList.map((post) => (
                      <div
                        key={post.id}
                        className="rounded-card border border-line bg-[#fcf8f0] px-4 py-3.5"
                      >
                        <div className="flex flex-wrap items-start gap-3">
                          <Avatar src={post.author?.avatar_url} name={post.author?.nickname} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/p/${post.id}`}
                                className="truncate font-serif text-[14.5px] text-ink hover:text-clay-deep"
                              >
                                {post.title || post.summary || '（无标题短文）'}
                              </Link>
                              <Badge tone={post.kind === 'article' ? 'clay' : 'neutral'}>
                                {post.kind === 'article' ? '文章' : '短文'}
                              </Badge>
                              <span className="text-[11px] text-ink-mute">
                                {post.author?.nickname} · {formatRelative(post.created_at)}
                              </span>
                            </div>
                            {(post.summary || post.message) && (
                              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                                {stripHtml(post.summary || post.message || '')}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              size="sm"
                              icon={<Check className="size-3.5" />}
                              loading={reviewPost.isPending && reviewPost.variables?.id === post.id}
                              onClick={() => reviewPost.mutate({ id: post.id, action: 'approve' })}
                            >
                              通过
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<X className="size-3.5" />}
                              onClick={() => reviewPost.mutate({ id: post.id, action: 'reject' })}
                            >
                              退回
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {commentList.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 font-serif text-[16px] text-ink">
                    <MessageSquare className="size-4 text-clay" />
                    评论 <span className="text-[12px] text-ink-mute">{commentList.length} 条</span>
                  </h2>
                  <div className="space-y-2">
                    {commentList.map((comment) => (
                      <div
                        key={comment.id}
                        className="flex flex-wrap items-start gap-3 rounded-card border border-line bg-white/60 px-4 py-3"
                      >
                        <Avatar src={comment.author?.avatar_url} name={comment.author?.nickname} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11.5px] text-ink-mute">
                            {comment.author?.nickname} · {formatRelative(comment.created_at)} ·{' '}
                            {comment.target_type === 'post' ? '文章下' : comment.target_type === 'media' ? '照片下' : '某处'}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                            {comment.content}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            size="sm"
                            icon={<Check className="size-3.5" />}
                            loading={reviewComment.isPending && reviewComment.variables?.id === comment.id}
                            onClick={() => reviewComment.mutate({ id: comment.id, action: 'approve' })}
                          >
                            通过
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<X className="size-3.5" />}
                            onClick={() => reviewComment.mutate({ id: comment.id, action: 'reject' })}
                          >
                            退回
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'reports' && (
        <>
          {reports.isLoading ? (
            <PageLoading label="正在查举报…" />
          ) : reportList.length === 0 ? (
            <EmptyState
              icon={<Flag className="size-6" />}
              title="没有人举报"
              description="村子小，大家也客气。真好。"
            />
          ) : (
            <div className="space-y-2">
              {reportList.map((report) => (
                <div key={report.id} className="rounded-card border border-line bg-[#fcf8f0] px-4 py-3.5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                      <AlertTriangle className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-serif text-[14px] text-ink">{report.reason}</span>
                        <Badge tone="neutral">
                          {report.target_type === 'post'
                            ? '文章'
                            : report.target_type === 'media'
                              ? '照片'
                              : report.target_type === 'comment'
                                ? '评论'
                                : report.target_type}
                        </Badge>
                        <span className="text-[11px] text-ink-mute">
                          {report.reporter?.nickname ?? '匿名'} 报于 {formatRelative(report.created_at)}
                        </span>
                      </div>
                      {report.detail && (
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">
                          {report.detail}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {REPORT_ACTIONS.map((action) => (
                        <Button
                          key={action.value}
                          variant={action.value === 'hide' ? 'danger' : 'outline'}
                          size="sm"
                          title={action.hint}
                          loading={
                            resolve.isPending &&
                            resolve.variables?.id === report.id &&
                            resolve.variables?.action === action.value
                          }
                          onClick={() => resolve.mutate({ id: report.id, action: action.value })}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'words' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div>
            {words.isLoading ? (
              <PageLoading label="正在取词库…" />
            ) : wordList.length === 0 ? (
              <EmptyState
                icon={<ShieldAlert className="size-6" />}
                title="词库是空的"
                description="不一定要填。真有需要的时候再加。"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {wordList.map((item) => (
                  <span
                    key={item.id}
                    className={cn(
                      'group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px]',
                      item.level >= 2
                        ? 'border-danger/30 bg-danger/[0.06] text-danger'
                        : 'border-line bg-white/60 text-ink-soft',
                    )}
                  >
                    {item.word}
                    <span className="text-[10px] opacity-60">L{item.level}</span>
                    <button
                      type="button"
                      onClick={() => deleteWord.mutate(item.id)}
                      aria-label={`删除 ${item.word}`}
                      className="opacity-40 transition-opacity hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-card border border-line bg-[#fcf8f0] px-5 py-5">
            <div className="font-serif text-[15px] text-ink">加一个词</div>
            <div className="mt-3 space-y-3">
              <Field label="词">
                <Input value={word} onChange={(event) => setWord(event.target.value)} placeholder="两个字的词" />
              </Field>
              <Field label="等级" hint="1 = 提醒，2 = 直接拦下">
                <Select value={level} onChange={(event) => setLevel(event.target.value)}>
                  <option value="1">一级 · 提醒</option>
                  <option value="2">二级 · 拦截</option>
                </Select>
              </Field>
              <Button
                className="w-full"
                icon={<Plus className="size-4" />}
                loading={addWord.isPending}
                disabled={!word.trim()}
                onClick={() => addWord.mutate()}
              >
                加进去
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
