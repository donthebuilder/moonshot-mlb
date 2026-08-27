import styles from '../../fantasy.module.css'

export default function LeagueLoading() {
  return <main className={styles.roomApp}><div className={styles.loadingHeader}><i/><i/><i/></div><div className={styles.loadingNav}>{Array.from({length:8},(_,i)=><i key={i}/>)}</div><div className={styles.loadingBody}><section><i/><i/><i/></section><div><article/><article/><article/></div><p>LOADING YOUR FRANCHISE…</p></div></main>
}
