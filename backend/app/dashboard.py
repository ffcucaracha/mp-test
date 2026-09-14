from __future__ import annotations

from html import escape

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from .database import get_db
from .feedback import DIARY_LABELS, FEATURE_COLORS, FEATURE_LABELS, feedback_summary
from .monetization import monetization_metrics_data
from .product_metrics import internal_metrics_data

router = APIRouter(tags=["Product"])


def _bar(label: str, value: float, maximum: float = 5) -> str:
    width = min(100, round(value / maximum * 100, 1)) if maximum else 0
    return ("<div class='bar-row'><span>" + escape(label) + "</span>"
            f"<div class='bar-track'><i style='width:{width}%'></i></div>"
            f"<strong>{value:g} / {maximum:g}</strong></div>")


def _distribution(rows: dict[str, int], labels: dict[str, str]) -> str:
    total = sum(rows.values())
    if not total:
        return "<p class='empty'>Пока нет ответов для этой диаграммы.</p>"
    return "".join(
        "<div class='distribution-row'>"
        f"<span>{escape(labels.get(key, key))}</span><div><i style='width:{count / total * 100:.1f}%'></i></div><strong>{count}</strong></div>"
        for key, count in rows.items()
    )


def _cards(items: list[tuple[str, str]]) -> str:
    return "".join(f"<article class='metric'><strong>{escape(value)}</strong><span>{escape(label)}</span></article>" for label, value in items)


@router.get("/internal/dashboard", response_class=HTMLResponse, include_in_schema=False)
def jury_dashboard(db: Session = Depends(get_db)) -> HTMLResponse:
    product, feedback = internal_metrics_data(db), feedback_summary(db)
    activation, social, alerts, ml = product["activation"], product["social"], product["alerts"], product["ml"]
    monetization = monetization_metrics_data(db)
    privacy_a, privacy_b = product["privacy"]["A"], product["privacy"]["B"]
    money_events = monetization["counts"]
    hypotheses = feedback["hypotheses"]
    feature_total = sum(feedback["feature_distribution"].values())
    legend = "".join(f"<li><i style='background:{FEATURE_COLORS[key]}'></i>{escape(label)} <b>{feedback['feature_distribution'].get(key, 0)}</b></li>" for key, label in FEATURE_LABELS.items())
    stops, start = [], 0.0
    for key in FEATURE_LABELS:
        count = feedback["feature_distribution"].get(key, 0)
        if count:
            end = start + count / feature_total * 360
            stops.append(f"{FEATURE_COLORS[key]} {start:.1f}deg {end:.1f}deg")
            start = end
    pie_style = f"background:conic-gradient({', '.join(stops)})" if stops else "background:#e5ebe3"
    comments = "".join(
        "<article class='quote'><div>"
        f"<b>{escape(row.user.name)}</b><span>{'★' * row.rating}</span></div>"
        f"<p>{escape(row.liked_text or row.improvement_text or 'Оценка без текстового комментария')}</p>"
        f"<small>{escape(row.improvement_text) if row.improvement_text else ''}</small></article>"
        for row in feedback["latest"][:6]
    ) or "<p class='empty'>Отзывы появятся после заполнения формы в приложении.</p>"
    privacy_rows = "".join([
        f"<tr><td>Поля</td><td>{privacy_a['fields']}</td><td>{privacy_b['fields']}</td></tr>",
        f"<tr><td>Точная география</td><td>{privacy_a['location_completion_rate']}%</td><td>{privacy_b['location_completion_rate']}%</td></tr>",
        f"<tr><td>Есть севооборот</td><td>{privacy_a['crop_rotation_completion_rate']}%</td><td>{privacy_b['crop_rotation_completion_rate']}%</td></tr>",
        f"<tr><td>Просмотры деталей</td><td>{privacy_a['detailed_field_views']}</td><td>{privacy_b['detailed_field_views']}</td></tr>",
    ])
    html = f"""<!doctype html><html lang='ru'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>AgroConnect — панель жюри</title><style>
:root{{--ink:#16251a;--muted:#657568;--green:#1d6b3a;--lime:#b9d84a;--paper:#f5f7ef;--line:#dce5d8;--orange:#e9a83a}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.45 Inter,ui-sans-serif,system-ui,sans-serif}}main{{max-width:1240px;margin:auto;padding:28px 20px 64px}}.hero{{background:linear-gradient(120deg,#174e31,#2b8050);color:#fff;border-radius:26px;padding:32px;position:relative;overflow:hidden}}.hero:after{{content:'';position:absolute;width:360px;height:360px;border:55px solid #b9d84a55;border-radius:50%;right:-120px;top:-230px}}h1{{font-size:clamp(28px,5vw,48px);line-height:1.05;margin:6px 0 12px}}h2{{font-size:23px;margin:34px 0 14px}}h3{{margin:0 0 15px;font-size:17px}}.eyebrow{{color:#d6f078;text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:12px}}.hero p,.muted{{color:var(--muted)}}.hero p{{color:#d4e4d7;max-width:680px;margin:0}}.grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px}}.metric,.panel,.quote{{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px}}.metric strong{{display:block;font-size:28px;line-height:1.1;color:var(--green)}}.metric span{{color:var(--muted);display:block;margin-top:6px}}.two{{display:grid;grid-template-columns:1.05fr .95fr;gap:16px}}.bar-row{{display:grid;grid-template-columns:1fr 1.5fr 64px;gap:10px;align-items:center;margin:12px 0}}.bar-track,.distribution-row>div{{height:10px;background:#e8eee5;border-radius:99px;overflow:hidden}}.bar-track i,.distribution-row i{{display:block;height:100%;background:linear-gradient(90deg,var(--green),#72ae58);border-radius:99px}}.bar-row strong{{font-size:12px;text-align:right}}.hypothesis{{border-left:4px solid var(--lime)}}.hypothesis b{{font-size:20px;color:var(--green)}}.chart{{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:24px}}.pie{{width:150px;height:150px;border-radius:50%;position:relative}}.pie:after{{content:'';position:absolute;inset:42px;background:#fff;border-radius:50%}}ul{{list-style:none;padding:0;margin:0}}li{{margin:8px 0;color:var(--muted)}}li i{{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}}li b{{color:var(--ink);margin-left:4px}}.distribution-row{{display:grid;grid-template-columns:130px 1fr 24px;gap:10px;align-items:center;margin:10px 0}}.quotes{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.quote{{min-height:130px}}.quote div{{display:flex;justify-content:space-between}}.quote div span{{color:var(--orange);letter-spacing:1px}}.quote p{{margin:13px 0 4px}}.quote small{{color:var(--muted)}}.note{{background:#eff6df;border:1px solid #d5e7ab;border-radius:14px;padding:13px 15px;color:#3d5936}}.empty{{color:var(--muted);margin:10px 0}}table{{width:100%;border-collapse:collapse}}th,td{{padding:10px 8px;text-align:left;border-bottom:1px solid var(--line)}}th{{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}}.funnel{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}}.funnel div{{padding:12px;background:#f0f6ec;border-radius:12px}}.funnel b{{display:block;font-size:21px;color:var(--green)}}.funnel span{{font-size:12px;color:var(--muted)}}@media(max-width:800px){{.grid{{grid-template-columns:repeat(2,1fr)}}.two,.quotes{{grid-template-columns:1fr}}.funnel{{grid-template-columns:repeat(2,1fr)}}}}@media(max-width:480px){{main{{padding:14px}}.hero{{padding:24px}}.grid{{grid-template-columns:1fr 1fr}}.bar-row{{grid-template-columns:1fr 1fr}}.bar-row strong{{display:none}}.chart{{grid-template-columns:1fr;justify-items:center}}}}
</style></head><body><main><header class='hero'><div class='eyebrow'>Внутренняя панель · живые данные</div><h1>AgroConnect<br>проверка гипотез MVP</h1><p>Все показатели на странице рассчитываются при запросе из PostgreSQL: события пользователей, отзывы, доступ к полям, предупреждения и результаты анализа растений.</p></header><h2>Продукт уже собран вокруг реальных хозяйств</h2><section class='grid'>{_cards([('Хозяйств', str(activation['users'])),('Полей с географией',f"{activation['fields_with_location']} / {activation['fields']}"),('Соседских связей',str(social['neighbors'])),('Публикаций с полей',str(social['posts']))])}</section><h2>Какие гипотезы проверяем</h2><section class='two'><div class='panel'><h3>Прямая оценка пользователей</h3>{_bar('Локальная сеть',hypotheses['local_network'])}{_bar('Предупреждения',hypotheses['alerts'])}{_bar('Комфорт приватности',hypotheses['privacy'])}<p class='muted'>Средние по последнему отзыву каждого пользователя; шкала 1–5.</p></div><div class='panel hypothesis'><h3>Логика продукта</h3><p><b>1. География — основа.</b> Поле с контуром становится личной точкой отсчёта для дневника, ленты и поиска соседей.</p><p><b>2. Практические события важнее общей ленты.</b> Проверяем через публикации, предупреждения и вовлечение в них.</p><p><b>3. Доверие строится на контроле доступа.</b> Хозяйство открывает все поля целиком и одобряет заявки соседей.</p></div></section><h2>Сигналы использования</h2><section class='grid'>{_cards([('Открытия ленты',str(social['feed_opens'])),('Реакции и комментарии',f"{social['reactions']} / {social['comments']}"),('Предупреждения открыты',f"{alerts['opened']} из {alerts['received']}"),('Открываемость предупреждений',f"{alerts['open_rate']}%"),('Заявки доступа',str(product['privacy']['A']['visit_requests'])),('Одобрено',f"{product['privacy']['A']['approval_rate']}%"),('ML-анализов',str(ml['analyses'])),('Размечено фермерами',f"{ml['label_rate']}%")])}</section><h2>Что пользователи считают ценным</h2><section class='two'><div class='panel'><h3>Главная ценность по отзывам</h3><div class='chart'><div class='pie' style='{pie_style}'></div><ul>{legend}</ul></div></div><div class='panel'><h3>Готовность вести историю поля</h3>{_distribution(feedback['diary_distribution'],DIARY_LABELS)}</div></section><h2>Голос пользователей</h2><p class='muted'>Последний отзыв каждого респондента. Текст не редактируется и не генерируется для панели.</p><section class='quotes'>{comments}</section><h2>Качество данных для следующего шага</h2><section class='note'>Анализ растения становится полезным только после обратной связи фермера: подтверждённые и исправленные диагнозы формируют собственный датасет. Сейчас: {ml['accepted']} подтверждено, {ml['corrected']} исправлено, {ml['rejected']} отклонено; после анализа опубликовано {ml['posts_after_ml']} сообщений и отправлено {ml['neighbor_warnings']} предупреждений соседям.</section></main></body></html>"""
    html = html.replace(
        "<h2>Сигналы использования</h2>",
        f"""<h2>A/B: открытые поля или доступ по запросу</h2>
<section class='two'><div class='panel'><h3>Гипотеза приватности</h3><p><b>Вариант A:</b> подробности поля открыты сразу.</p><p><b>Вариант B:</b> сначала виден профиль и общая информация, детали открываются после заявки владельцу.</p><p class='muted'>Сравниваем заполненность географии и севооборота, а также интерес к подробностям. Это данные текущей БД, не подставная статистика.</p></div><div class='panel'><table><thead><tr><th>Метрика</th><th>A</th><th>B</th></tr></thead><tbody>{privacy_rows}</tbody></table></div></section>
<h2>Интерес к платным функциям</h2>
<section class='two'><div class='panel'><h3>Псевдоплатный эксперимент</h3><p>Сначала проверяем интерес к расширенной аналитике хозяйства. Затем после тестовой рекламы предлагаем убрать её за <b>299 ₽/мес</b>. Списаний и подписки в MVP нет.</p><div class='funnel'><div><b>{money_events['premium_teaser_shown']}</b><span>тизер показан</span></div><div><b>{money_events['premium_teaser_clicked']}</b><span>тизер открыт</span></div><div><b>{money_events['ad_impression']}</b><span>реклама показана</span></div><div><b>{money_events['ad_free_offer_shown']}</b><span>offer показан</span></div></div></div><div class='panel'><h3>Сигнал интереса</h3>{_cards([('CTR расширенной аналитики',f"{monetization['teaser_ctr_percent']}%"),('Закрыли рекламу',f"{monetization['ad_close_rate_percent']}%"),('Приняли решение',f"{monetization['offer_decision_rate_percent']}%"),('Выбрали «без рекламы»',f"{monetization['ad_free_acceptance_percent']}%")])}<p class='muted'>«Без рекламы» считается среди тех, кто выбрал «подключить» или «не сейчас».</p></div></section>
<h2>Сигналы использования</h2>""",
    )
    return HTMLResponse(html)
