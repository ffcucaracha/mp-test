"""Selenium flow for a recorded AgroConnect web demonstration.

The file is intentionally a single, ordered test: a recording is easier to edit
when the product journey has no pytest fixture noise between scenes.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


BASE_URL = os.environ.get("DEMO_BASE_URL", "http://127.0.0.1:5173")
PAUSE = float(os.environ.get("DEMO_PAUSE_SECONDS", "2.5"))
LONG_PAUSE = float(os.environ.get("DEMO_LONG_PAUSE_SECONDS", "4"))
ROOT = Path(__file__).resolve().parent
PHOTO = ROOT / "assets" / "plant-problem.svg"


def wait(driver: webdriver.Chrome, selector: tuple[str, str], seconds: int = 15):
    return WebDriverWait(driver, seconds).until(EC.presence_of_element_located(selector))


def clickable(driver: webdriver.Chrome, selector: tuple[str, str], seconds: int = 15):
    return WebDriverWait(driver, seconds).until(EC.element_to_be_clickable(selector))


def pause(seconds: float = PAUSE) -> None:
    time.sleep(seconds)


def go(driver: webdriver.Chrome, nav: str, title: str) -> None:
    clickable(driver, (By.CSS_SELECTOR, f'[data-demo-nav="{nav}"]')).click()
    wait(driver, (By.XPATH, f'//h1[contains(normalize-space(), "{title}")]'))
    pause()


def set_offline(driver: webdriver.Chrome, value: bool) -> None:
    if value:
        driver.execute_script(
            "Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => false});"
            "window.dispatchEvent(new Event('offline'));"
        )
    else:
        driver.execute_script("delete navigator.onLine; window.dispatchEvent(new Event('online'));")


@pytest.fixture
def driver():
    options = Options()
    options.add_argument("--kiosk")
    options.add_argument("--window-size=450,1000")
    options.add_argument("--force-device-scale-factor=1")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-infobars")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    browser = webdriver.Chrome(options=options)
    browser.set_window_size(450, 1000)
    yield browser
    browser.quit()


@pytest.mark.demo
def test_record_agroconnect_story(driver: webdriver.Chrome):
    """Record the same connected story described in docs/DEMO_VIDEO.md."""
    driver.get(BASE_URL)
    wait(driver, (By.CSS_SELECTOR, '[data-demo-user="anna_farm"]'))
    pause(1)
    clickable(driver, (By.CSS_SELECTOR, '[data-demo-user="anna_farm"]')).click()
    wait(driver, (By.XPATH, '//h1[contains(normalize-space(), "Иваново Агро")]'))
    pause(LONG_PAUSE)

    # Field diary, crop rotation and weather from a real seeded field.
    go(driver, "fields", "Поля")
    first_field = wait(driver, (By.CSS_SELECTOR, 'article.field-card:not(.pending-field-card)'))
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", first_field)
    wait(driver, (By.CSS_SELECTOR, '.crop-rotation'))
    pause(LONG_PAUSE)
    weather = wait(driver, (By.CSS_SELECTOR, '.weather-panel'))
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", weather)
    pause(LONG_PAUSE)

    # Nearby farmers and name search are read-only scenes and safe to repeat.
    go(driver, "neighbors", "Соседи")
    search = wait(driver, (By.CSS_SELECTOR, 'input[placeholder*="Иванова"]'))
    search.send_keys("Хабибуллин")
    clickable(driver, (By.XPATH, '//button[normalize-space()="Найти"]')).click()
    wait(driver, (By.XPATH, '//*[contains(text(), "Ильдар Хабибуллин")]'))
    pause(LONG_PAUSE)

    # Beekeeper scenario: switch the test account without a distracting logout shot.
    driver.execute_script("localStorage.setItem('agroconnect.userId', '5');")
    driver.get(f"{BASE_URL}/#/alerts")
    wait(driver, (By.XPATH, '//h1[normalize-space()="Предупреждения"]'))
    wait(driver, (By.CSS_SELECTOR, '.alert-card'))
    pause(LONG_PAUSE)

    # Return to Anna for an actual offline post saved into IndexedDB outbox.
    driver.execute_script("localStorage.setItem('agroconnect.userId', '1');")
    driver.get(f"{BASE_URL}/#/feed")
    wait(driver, (By.XPATH, '//h1[contains(normalize-space(), "Лента рядом")]'))
    clickable(driver, (By.XPATH, '//button[contains(normalize-space(), "Публикация")]')).click()
    photo = wait(driver, (By.CSS_SELECTOR, 'input[type="file"]'))
    photo.send_keys(str(PHOTO))
    pause(1)
    set_offline(driver, True)
    try:
        publish = clickable(driver, (By.XPATH, '//button[contains(normalize-space(), "Сохранить и отправить позже")]'))
        publish.click()
        wait(driver, (By.XPATH, '//*[contains(text(), "сохранена на устройстве")]'))
        pause(LONG_PAUSE)
    finally:
        set_offline(driver, False)

    # Show the manual sync control. It may complete immediately on a fast backend.
    drafts = clickable(driver, (By.CSS_SELECTOR, '[aria-label^="Черновики"]'))
    drafts.click()
    try:
        clickable(driver, (By.XPATH, '//button[normalize-space()="Отправить сейчас"]'), seconds=8).click()
    except TimeoutException:
        pass
    pause(LONG_PAUSE)

    # AI is shown as a prepared preview. A failed external provider must not fail a recording.
    go(driver, "feed", "Лента рядом")
    clickable(driver, (By.XPATH, '//button[contains(normalize-space(), "Публикация")]')).click()
    photo = wait(driver, (By.CSS_SELECTOR, 'input[type="file"]'))
    photo.send_keys(str(PHOTO))
    analyze = clickable(driver, (By.XPATH, '//button[normalize-space()="Проанализировать фото"]'))
    analyze.click()
    try:
        wait(driver, (By.XPATH, '//*[contains(text(), "Похоже на:")]'), seconds=20)
    except TimeoutException:
        # The UI still demonstrates that analysis is an optional online step.
        pass
    pause(LONG_PAUSE)
