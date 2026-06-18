import React, { useState, useRef, useEffect } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, PanResponder, Dimensions, StyleSheet } from 'react-native';
import { theme } from '../data/constants';

// Custom Slider component to avoid native linking issues
const CustomSlider = ({ value, onValueChange, minimumValue, maximumValue, step, style }) => {
  const [isDragging, setIsDragging] = useState(false);
  const sliderWidth = Dimensions.get('window').width - 64; // padding

  const handlePress = (event) => {
    const { locationX } = event.nativeEvent;
    const newValue = Math.max(minimumValue, Math.min(maximumValue, minimumValue + (locationX / sliderWidth) * (maximumValue - minimumValue)));
    const steppedValue = step ? Math.round(newValue / step) * step : newValue;
    onValueChange(steppedValue);
  };

  const thumbPosition = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;

  return (
    <View style={[styles.sliderContainer, style]}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${thumbPosition}%` }]} />
        <View style={[styles.sliderThumb, { left: `${thumbPosition}%` }]} />
      </View>
      <TouchableOpacity
        style={styles.sliderTouchArea}
        activeOpacity={1}
        onPressIn={() => setIsDragging(true)}
        onPressOut={() => setIsDragging(false)}
        onPress={handlePress}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sliderContainer: {
    height: 40,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#72a820',
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    top: -8,
    marginLeft: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sliderTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

const ALBUM_COVER_IMAGES = [
  { id: '1', uri: require('../../assets/images/1.png') },
  { id: '2', uri: require('../../assets/images/2.png') },
  { id: '3', uri: require('../../assets/images/3.png') },
  { id: '4', uri: require('../../assets/images/4.png') },
  { id: '5', uri: require('../../assets/images/5.png') },
  { id: '6', uri: require('../../assets/images/6.png') },
  { id: '7', uri: require('../../assets/images/7.png') },
];

const EDIT_SETTINGS = [
  { id: 'zoom', label: 'Zoom', min: 0.5, max: 3, step: 0.1, default: 1 },
  { id: 'brightness', label: 'Brightness', min: -50, max: 50, step: 1, default: 0 },
  { id: 'position', label: 'Position', min: 0, max: 1, step: 0.1, default: 0 },
];

const FONT_OPTIONS = [
  { id: 'system', name: 'System', family: 'System' },
  { id: 'arial', name: 'Arial', family: 'Arial' },
  { id: 'georgia', name: 'Georgia', family: 'Georgia' },
  { id: 'courier', name: 'Courier', family: 'Courier New' },
  { id: 'times', name: 'Times', family: 'Times New Roman' },
  { id: 'verdana', name: 'Verdana', family: 'Verdana' },
];

const COLOR_OPTIONS = [
  { id: '#ffffff', name: 'White' },
  { id: '#000000', name: 'Black' },
  { id: '#ff0000', name: 'Red' },
  { id: '#00ff00', name: 'Green' },
  { id: '#0000ff', name: 'Blue' },
  { id: '#ffff00', name: 'Yellow' },
  { id: '#ff00ff', name: 'Magenta' },
  { id: '#00ffff', name: 'Cyan' },
];

export default function AlbumCoverEditor({ visible, onClose, onSelect }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(0);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(1);
  const [blur, setBlur] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [textOverlays, setTextOverlays] = useState([]);
  const [newText, setNewText] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [activeEditSetting, setActiveEditSetting] = useState('zoom');
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [draggingTextId, setDraggingTextId] = useState(null);

  // Auto-select random image with random edits on mount
  useEffect(() => {
    if (visible && !selectedImage) {
      const randomImage = ALBUM_COVER_IMAGES[Math.floor(Math.random() * ALBUM_COVER_IMAGES.length)];
      setSelectedImage(randomImage);
      setZoom(0.8 + Math.random() * 0.4);
      setHue(Math.floor(Math.random() * 360));
      setSaturation(0.8 + Math.random() * 0.4);
      setBrightness(Math.floor(Math.random() * 40) - 20);
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const { dx, dy } = evt.nativeEvent;
        setPanPosition({ x: panPosition.x + dx, y: panPosition.y + dy });
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const handleImageSelect = (image) => {
    setSelectedImage(image);
    setShowEditor(true);
  };

  const handleConfirm = () => {
    if (selectedImage) {
      onSelect({
        imageId: selectedImage.id,
        uri: selectedImage.uri,
        edits: { zoom, brightness, positionX, positionY, hue, saturation, blur, contrast, textOverlays, panPosition },
      });
    }
    onClose();
    // Reset state
    setSelectedImage(null);
    setZoom(1);
    setBrightness(0);
    setPositionX(0);
    setPositionY(0);
    setHue(0);
    setSaturation(1);
    setBlur(0);
    setContrast(1);
    setTextOverlays([]);
    setNewText('');
    setPanPosition({ x: 0, y: 0 });
    setScale(1);
    setShowEditor(false);
  };

  const addTextOverlay = () => {
    if (newText.trim()) {
      setTextOverlays([...textOverlays, {
        id: Date.now().toString(),
        text: newText,
        x: 150,
        y: 150,
        font: 'system',
        fontSize: 24,
        color: '#ffffff',
      }]);
      setNewText('');
    }
  };

  const updateTextOverlayFont = (id, fontId) => {
    setTextOverlays(textOverlays.map(t => t.id === id ? { ...t, font: fontId } : t));
  };

  const updateTextOverlayFontSize = (id, size) => {
    setTextOverlays(textOverlays.map(t => t.id === id ? { ...t, fontSize: size } : t));
  };

  const updateTextOverlayColor = (id, color) => {
    setTextOverlays(textOverlays.map(t => t.id === id ? { ...t, color } : t));
  };

  const removeTextOverlay = (id) => {
    setTextOverlays(textOverlays.filter(t => t.id !== id));
  };

  const textPanResponder = useRef((textId) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (evt) => {
      const { dx, dy } = evt.nativeEvent;
      setTextOverlays(textOverlays.map(t => {
        if (t.id === textId) {
          return { ...t, x: t.x + dx, y: t.y + dy };
        }
        return t;
      }));
    },
    onPanResponderRelease: () => {},
  })).current;

  const handleBack = () => {
    setShowEditor(false);
  };

  const getImageStyle = () => {
    return {
      width: 300,
      height: 300,
      transform: [
        { scale: zoom },
        { translateX: positionX },
        { translateY: positionY },
      ],
      opacity: 1 + brightness / 100,
    };
  };

  const getEditValue = (settingId) => {
    switch (settingId) {
      case 'zoom': return zoom;
      case 'brightness': return brightness;
      default: return 0;
    }
  };

  const setEditValue = (settingId, value) => {
    switch (settingId) {
      case 'zoom': setZoom(value); setScale(value); break;
      case 'brightness': setBrightness(value); break;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
        {!showEditor ? (
          // Image Selection Grid
          <View style={{ width: '100%', height: '100%', padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <TouchableOpacity onPress={onClose} style={{ padding: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Choose Cover</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {ALBUM_COVER_IMAGES.map((image) => (
                  <TouchableOpacity
                    key={image.id}
                    onPress={() => handleImageSelect(image)}
                    style={{ 
                      width: (Dimensions.get('window').width - 72) / 2, 
                      height: (Dimensions.get('window').width - 72) / 2, 
                      borderRadius: 20, 
                      overflow: 'hidden',
                      borderWidth: 3,
                      borderColor: selectedImage?.id === image.id ? theme.cyan : 'transparent',
                    }}
                  >
                    <Image source={image.uri} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : (
          // Apple Photos-style Editor
          <ScrollView style={{ width: '100%', height: '100%' }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <TouchableOpacity onPress={handleBack} style={{ padding: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                style={{ backgroundColor: theme.cyan, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}
              >
                <Text style={{ color: '#000', fontSize: 14, fontWeight: '800' }}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Image Preview with PanResponder */}
            <View style={{ justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: 20, marginBottom: 20 }}>
              <View {...panResponder.panHandlers} style={{ width: 300, height: 300, overflow: 'hidden', borderRadius: 20 }}>
                <Image source={selectedImage.uri} style={getImageStyle()} resizeMode="cover" />
                {textOverlays.map((overlay) => {
                  const fontOption = FONT_OPTIONS.find(f => f.id === overlay.font) || FONT_OPTIONS[0];
                  return (
                    <View
                      key={overlay.id}
                      {...textPanResponder(overlay.id).panHandlers}
                      style={{ position: 'absolute', left: overlay.x, top: overlay.y }}
                    >
                      <Text style={{ 
                        color: overlay.color || '#fff', 
                        fontSize: overlay.fontSize || 24, 
                        fontFamily: fontOption.family,
                        textShadowColor: 'rgba(0,0,0,0.8)', 
                        textShadowOffset: { width: 2, height: 2 }, 
                        textShadowRadius: 4 
                      }}>
                        {overlay.text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Edit Settings Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ justifyContent: 'center', gap: 6, paddingHorizontal: 20, marginTop: 20, marginBottom: 20 }}>
              {EDIT_SETTINGS.map((setting) => (
                <TouchableOpacity
                  key={setting.id}
                  onPress={() => setActiveEditSetting(setting.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: activeEditSetting === setting.id ? 'rgba(0,168,190,0.2)' : 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    borderColor: activeEditSetting === setting.id ? 'rgba(0,168,190,0.4)' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <Text style={{ color: activeEditSetting === setting.id ? '#00a8be' : 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' }}>
                    {setting.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Active Edit Control */}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
              {activeEditSetting === 'position' ? (
                <View style={{ gap: 16 }}>
                  <View style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>X Position</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{positionX}</Text>
                    </View>
                    <CustomSlider
                      value={positionX}
                      onValueChange={(v) => { setPositionX(v); setPanPosition({ ...panPosition, x: v }); }}
                      minimumValue={-150}
                      maximumValue={150}
                      step={1}
                      style={{ width: '100%' }}
                    />
                  </View>
                  <View style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Y Position</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{positionY}</Text>
                    </View>
                    <CustomSlider
                      value={positionY}
                      onValueChange={(v) => { setPositionY(v); setPanPosition({ ...panPosition, y: v }); }}
                      minimumValue={-150}
                      maximumValue={150}
                      step={1}
                      style={{ width: '100%' }}
                    />
                  </View>
                </View>
              ) : (
                EDIT_SETTINGS.find(s => s.id === activeEditSetting) && (() => {
                  const setting = EDIT_SETTINGS.find(s => s.id === activeEditSetting);
                  const value = getEditValue(activeEditSetting);
                  return (
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{setting.label}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                          {activeEditSetting === 'zoom' ? `${value.toFixed(1)}x` : `${value}`}
                        </Text>
                      </View>
                      <CustomSlider
                        value={value}
                        onValueChange={(v) => setEditValue(activeEditSetting, v)}
                        minimumValue={setting.min}
                        maximumValue={setting.max}
                        step={setting.step}
                        style={{ width: '100%' }}
                      />
                    </View>
                  );
                })()
              )}
            </View>

            {/* Text Overlays Section */}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 }}>Text Overlays</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', color: '#fff', padding: 12, fontSize: 14 }}
                  placeholder="Add text..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={newText}
                  onChangeText={setNewText}
                  maxLength={20}
                />
                <TouchableOpacity
                  onPress={addTextOverlay}
                  style={{ backgroundColor: 'rgba(0,168,190,0.2)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,168,190,0.4)', paddingHorizontal: 16, justifyContent: 'center' }}
                >
                  <Text style={{ color: '#00a8be', fontSize: 14, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
              </View>
              {textOverlays.length > 0 && (
                <View style={{ gap: 6 }}>
                  {textOverlays.map((overlay) => (
                    <View key={overlay.id} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 13 }}>{overlay.text}</Text>
                        <TouchableOpacity onPress={() => removeTextOverlay(overlay.id)} style={{ padding: 4 }}>
                          <Text style={{ color: '#cc3348', fontSize: 16, fontWeight: '700' }}>×</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ gap: 8 }}>
                        <View style={{ gap: 4 }}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Font</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ gap: 4 }}>
                            {FONT_OPTIONS.map((font) => (
                              <TouchableOpacity
                                key={font.id}
                                onPress={() => updateTextOverlayFont(overlay.id, font.id)}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 6,
                                  backgroundColor: overlay.font === font.id ? 'rgba(0,168,190,0.2)' : 'rgba(255,255,255,0.05)',
                                  borderWidth: 1,
                                  borderColor: overlay.font === font.id ? 'rgba(0,168,190,0.4)' : 'rgba(255,255,255,0.1)',
                                  marginRight: 4,
                                }}
                              >
                                <Text style={{ color: overlay.font === font.id ? '#00a8be' : 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700' }}>
                                  {font.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                        <View style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Size</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{overlay.fontSize || 24}</Text>
                          </View>
                          <CustomSlider
                            value={overlay.fontSize || 24}
                            onValueChange={(v) => updateTextOverlayFontSize(overlay.id, v)}
                            minimumValue={12}
                            maximumValue={48}
                            step={1}
                            style={{ width: '100%' }}
                          />
                        </View>
                        <View style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>X Position</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{overlay.x}</Text>
                          </View>
                          <CustomSlider
                            value={overlay.x}
                            onValueChange={(v) => setTextOverlays(textOverlays.map(t => t.id === overlay.id ? { ...t, x: v } : t))}
                            minimumValue={0}
                            maximumValue={300}
                            step={1}
                            style={{ width: '100%' }}
                          />
                        </View>
                        <View style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Y Position</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{overlay.y}</Text>
                          </View>
                          <CustomSlider
                            value={overlay.y}
                            onValueChange={(v) => setTextOverlays(textOverlays.map(t => t.id === overlay.id ? { ...t, y: v } : t))}
                            minimumValue={0}
                            maximumValue={300}
                            step={1}
                            style={{ width: '100%' }}
                          />
                        </View>
                        <View style={{ gap: 4 }}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Color</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ gap: 4 }}>
                            {COLOR_OPTIONS.map((color) => (
                              <TouchableOpacity
                                key={color.id}
                                onPress={() => updateTextOverlayColor(overlay.id, color.id)}
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 12,
                                  backgroundColor: color.id,
                                  borderWidth: 2,
                                  borderColor: overlay.color === color.id ? '#00a8be' : 'rgba(255,255,255,0.2)',
                                  marginRight: 4,
                                }}
                              />
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
