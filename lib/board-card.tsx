import type { BoosterBoard } from "lib/board-types"

type BoardCardProps = {
  board: BoosterBoard
  index: number
}

export function BoardCard({ board, index }: BoardCardProps) {
  return (
    <a
      className="board-card"
      href={`/boards/${board.slug}/`}
      style={{ "--card-order": index } as React.CSSProperties}
    >
      <div className="board-card__image-wrap">
        <img
          className="board-card__image"
          src={board.assets.thumbnail}
          alt={`3D preview of ${board.name}`}
          loading="lazy"
        />
        <span className="board-card__inspect">Inspect board ↗</span>
      </div>
      <div className="board-card__body">
        <div className="board-card__kicker">TI BoosterPack</div>
        <h2>{board.name}</h2>
        <p>{board.description}</p>
        <ul className="tag-list" aria-label="Board categories">
          {board.tags.slice(0, 3).map((tag) => (
            <li className="tag" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      </div>
    </a>
  )
}
