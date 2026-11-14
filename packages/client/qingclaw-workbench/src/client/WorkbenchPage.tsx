/** QingClaw Workbench page: daily quote, official links, and the public Feed v1 catalog. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button, IconGlobeOutlineRegular, IconPlayOutlineRegular, IconRefreshOutlineRegular,
  IconSparkleRegular, IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkbenchCourse, WorkbenchFeedResult, WorkbenchVideo } from '../types.ts'
import { dailyQuoteKey } from './daily-quote.ts'
import type { NS } from './locales.ts'
import css from './WorkbenchPage.module.css'

/** Narrow actions supplied by the browser plugin; the page never reads Cordis directly. */
export interface WorkbenchPageInjected {
  readonly loadFeed: (refresh: boolean) => Promise<WorkbenchFeedResult>
}

/** Props assembled by the global main-panel slot. */
export type WorkbenchPageProps = PropsRuntime<'main'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchPageInjected>

type FeedViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly result: WorkbenchFeedResult; readonly refreshing: boolean }

/** Render the responsive Workbench surface. */
export function WorkbenchPage({ loadFeed, t }: WorkbenchPageProps): ReactNode {
  const [state, setState] = useState<FeedViewState>({ status: 'loading' })
  const generation = useRef(0)
  const query = useCallback(async (refresh: boolean): Promise<void> => {
    const request = ++generation.current
    setState(current => current.status === 'ready'
      ? { ...current, refreshing: true }
      : { status: 'loading' })
    try {
      const result = await loadFeed(refresh)
      if (generation.current === request) setState({ status: 'ready', result, refreshing: false })
    } catch {
      if (generation.current === request) setState({ status: 'error' })
    }
  }, [loadFeed])

  useEffect(() => {
    void query(false)
    return () => { generation.current += 1 }
  }, [query])

  const result = state.status === 'ready' ? state.result : undefined
  const refreshing = state.status === 'ready' && state.refreshing
  const allCourses = result?.feed.links.allCourses ?? 'https://qingclaw.com/courses'
  return (
    <main className={css.page} aria-busy={state.status === 'loading' || refreshing}>
      <div className={css.content}>
        <header className={css.header}>
          <div className={css.headerCopy}>
            <h1>{t('title')}</h1>
            <p>{t('subtitle')}</p>
          </div>
          <Button variant="outline" size="sm" className={css.refresh}
            icon={<IconRefreshOutlineRegular size={14} />}
            disabled={state.status === 'loading' || refreshing}
            onClick={() => { void query(true) }}>
            {refreshing ? t('refreshing') : t('refresh')}
          </Button>
        </header>

        <section className={css.quote} aria-labelledby="qingclaw-workbench-quote">
          <span className={css.quoteIcon}><IconSparkleRegular size={18} /></span>
          <div>
            <h2 id="qingclaw-workbench-quote">{t('dailyQuote')}</h2>
            <p>“{t(dailyQuoteKey(new Date()))}”</p>
          </div>
        </section>

        <nav className={css.officialLinks} aria-label={t('officialSite')}>
          <a href="https://qingclaw.com/" target="_blank" rel="noopener noreferrer">
            <IconGlobeOutlineRegular size={16} />
            <span>{t('officialSite')}</span>
          </a>
          <a href={allCourses} target="_blank" rel="noopener noreferrer">
            <IconPlayOutlineRegular size={16} />
            <span>{t('courseCenter')}</span>
          </a>
        </nav>

        {state.status === 'error' ? (
          <section className={css.error} role="alert">
            <IconWarningOutlineRegular size={24} />
            <h2>{t('unavailableTitle')}</h2>
            <p>{t('unavailableDescription')}</p>
            <Button variant="primary" size="sm" onClick={() => { void query(true) }}>{t('retry')}</Button>
          </section>
        ) : (
          <>
            {result?.stale === true && (
              <p className={css.stale} role="status">
                <IconWarningOutlineRegular size={15} />
                <span>{t('stale')}</span>
              </p>
            )}
            <FeedSection title={t('latestVideos')} description={t('latestVideosDescription')}>
              {state.status === 'loading'
                ? <CardSkeleton count={3} label={t('loading')} />
                : result?.feed.latestVideos.length === 0
                  ? <p className={css.empty}>{t('emptyVideos')}</p>
                  : <div className={css.grid}>{result?.feed.latestVideos.map(video => (
                    <VideoCard key={video.id} video={video} action={t('watchVideo')} />
                  ))}</div>}
            </FeedSection>
            <FeedSection title={t('featuredCourses')} description={t('featuredCoursesDescription')}
              trailing={<a className={css.allCourses} href={allCourses} target="_blank" rel="noopener noreferrer">{t('allCourses')}</a>}>
              {state.status === 'loading'
                ? <CardSkeleton count={2} label={t('loading')} />
                : result?.feed.featuredCourses.length === 0
                  ? <p className={css.empty}>{t('emptyCourses')}</p>
                  : <div className={css.grid}>{result?.feed.featuredCourses.map(course => (
                    <CourseCard key={course.id} course={course} action={t('openCourse')}
                      lessons={t('lessons', { count: course.lessonCount })} />
                  ))}</div>}
            </FeedSection>
          </>
        )}
      </div>
    </main>
  )
}

function FeedSection({ title, description, trailing, children }: {
  readonly title: string
  readonly description: string
  readonly trailing?: ReactNode
  readonly children: ReactNode
}): ReactNode {
  return (
    <section className={css.section}>
      <div className={css.sectionHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {trailing}
      </div>
      {children}
    </section>
  )
}

function VideoCard({ video, action }: { readonly video: WorkbenchVideo; readonly action: string }): ReactNode {
  const meta = [video.courseTitle, video.duration].filter((value): value is string => value !== undefined)
  return (
    <a className={css.card} href={video.watchUrl} target="_blank" rel="noopener noreferrer" aria-label={`${action}: ${video.title}`}>
      <Cover image={video.coverUrl} />
      <span className={css.cardBody}>
        <strong>{video.title}</strong>
        {meta.length > 0 && <span className={css.meta}>{meta.join(' · ')}</span>}
        <span className={css.cardAction}>{action}</span>
      </span>
    </a>
  )
}

function CourseCard({ course, action, lessons }: {
  readonly course: WorkbenchCourse
  readonly action: string
  readonly lessons: string
}): ReactNode {
  return (
    <a className={css.card} href={course.courseUrl} target="_blank" rel="noopener noreferrer" aria-label={`${action}: ${course.title}`}>
      <Cover image={course.coverUrl} />
      <span className={css.cardBody}>
        <strong>{course.title}</strong>
        <span className={css.meta}>{lessons}</span>
        <span className={css.cardAction}>{action}</span>
      </span>
    </a>
  )
}

function Cover({ image }: { readonly image: string | undefined }): ReactNode {
  return (
    <span className={css.cover}>
      {image === undefined
        ? <IconPlayOutlineRegular size={28} aria-hidden="true" />
        : <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
    </span>
  )
}

function CardSkeleton({ count, label }: { readonly count: number; readonly label: string }): ReactNode {
  return (
    <div className={css.grid} aria-label={label}>
      <span className={css.srOnly}>{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div className={css.skeleton} aria-hidden="true" key={index}>
          <span className={css.skeletonCover} />
          <span className={css.skeletonLine} />
          <span className={css.skeletonShort} />
        </div>
      ))}
    </div>
  )
}
