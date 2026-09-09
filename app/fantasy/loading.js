import styles from './fantasy.module.css'

export default function FantasyLoading() {
  return <main className={styles.roomApp}><div className={styles.loadingHeader}><i/><i/><i/></div><div className={styles.loadingBody}><section><i/><i/><i/></section><div><article/><article/><article/></div><p>LOADING FRANCHISE…</p></div></main>
}
