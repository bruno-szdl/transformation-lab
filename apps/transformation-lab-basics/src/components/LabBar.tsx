/**
 * The thin DataGym.io hub-chrome strip above the app header - the only
 * DataGym.io branding inside the quest. Mirrors the dbt cheat sheet's labbar:
 * a "‹ DataGym.io" link back to the hub on the left, a lab tag on the right.
 *
 * The logo is theme-swapped in CSS (see `.labbar__logo` in index.css): the
 * quest's dark theme leaves `data-theme` empty, light sets it to "light".
 */
export default function LabBar() {
  return (
    <div className="labbar">
      <a className="labbar__back" href="https://datagym.io">
        <span className="labbar__arrow" aria-hidden="true">
          ‹
        </span>
        <img
          className="labbar__logo labbar__logo--default"
          src="/brand/logo.svg"
          height={13}
          alt=""
          aria-hidden="true"
        />
        <img
          className="labbar__logo labbar__logo--light"
          src="/brand/logo-light.svg"
          height={13}
          alt=""
          aria-hidden="true"
        />
        DataGym.io
      </a>
      <span className="labbar__tag">A DataGym.io Lab</span>
    </div>
  )
}
