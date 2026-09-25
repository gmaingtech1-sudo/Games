import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import gameHtml from './game/gameHtml';

// The game itself is the web version in ../pocket-mochi, inlined into
// game/gameHtml.js and drawn in a full-screen WebView. This file is the
// native shell around it: saving, haptics, and app lifecycle.

const SAVE_KEY = 'pocket-mochi-save-v1';
const SHELL = '#2A2C52';

const HAPTICS = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

// Put the saved pet straight into the page so it is there before the game
// boots. Escaping "<" keeps a pet name like "</script>" from breaking out.
function buildHtml(save) {
  const boot = JSON.stringify({ save, platform: Platform.OS }).replace(/</g, '\\u003c');
  return gameHtml.replace('<!--PM_NATIVE_BOOT-->', `<script>window.__PM_NATIVE__ = ${boot};</script>`);
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.root}>
        <Game />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Game() {
  const web = useRef(null);
  const overlayOpen = useRef(false);
  // save: undefined while reading storage, then the saved JSON or null.
  // key: bumped to remount the WebView with a fresh copy of the save.
  const [boot, setBoot] = useState({ save: undefined, key: 0 });

  const loadFromStorage = useCallback(() => {
    AsyncStorage.getItem(SAVE_KEY)
      .catch(() => null)
      .then((save) => setBoot((b) => ({ save, key: b.key + 1 })));
  }, []);

  useEffect(loadFromStorage, [loadFromStorage]);

  const html = useMemo(() => (boot.save === undefined ? null : buildHtml(boot.save)), [boot]);

  const send = useCallback((msg) => {
    web.current?.injectJavaScript(`window.PM && PM.host && PM.host.receive(${JSON.stringify(msg)}); true;`);
  }, []);

  // Save when the app is backgrounded; catch up on needs when it comes back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      send({ t: state === 'active' ? 'resume' : 'pause' });
    });
    return () => sub.remove();
  }, [send]);

  // Android back closes the shop, snack tray, washing or the mini-game first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!overlayOpen.current) return false;
      send({ t: 'back' });
      return true;
    });
    return () => sub.remove();
  }, [send]);

  const onMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'save':
        AsyncStorage.setItem(SAVE_KEY, msg.data).catch(() => {});
        break;
      case 'wipe':
        AsyncStorage.removeItem(SAVE_KEY).catch(() => {});
        break;
      case 'haptic': {
        const play = HAPTICS[msg.style];
        if (play) play().catch(() => {});
        break;
      }
      case 'overlay':
        overlayOpen.current = !!msg.open;
        break;
      default:
        break;
    }
  }, []);

  // If the OS kills the WebView's process, reload it from the latest save
  // rather than the copy that was baked into the page at launch.
  const onCrash = useCallback(() => {
    overlayOpen.current = false;
    setBoot((b) => ({ save: undefined, key: b.key }));
    loadFromStorage();
  }, [loadFromStorage]);

  if (html === null) return <View style={styles.root} />;

  return (
    <WebView
      key={boot.key}
      ref={web}
      style={styles.web}
      containerStyle={styles.root}
      source={{ html, baseUrl: 'https://pocket-mochi.app/' }}
      originWhitelist={['*']}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      hideKeyboardAccessoryView
      setSupportMultipleWindows={false}
      textZoom={100}
      dataDetectorTypes="none"
      webviewDebuggingEnabled={__DEV__}
      onContentProcessDidTerminate={onCrash}
      onRenderProcessGone={onCrash}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHELL,
  },
  web: {
    flex: 1,
    backgroundColor: SHELL,
  },
});
