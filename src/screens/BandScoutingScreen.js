import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useGame } from '../state/GameState';
import { useTheme } from '../context/ThemeContext';
import { spacing, fontSize, fontWeight } from '../styles/designSystem';
import { colors, shadows, borderRadius } from '../styles/newDesignSystem';
import { BackButton } from '../components/UI';

const BAND_SCOUTING_TIPS = [
  { label: 'Band Scouting', body: 'Browse bands looking for members. Each band shows their genre, current members, and what they\'re looking for. Join a band to start collaborating on music together.' },
  { label: 'Joining a Band', body: 'When you join a band, you become a member and can create songs as that band. Band members split revenue based on their share percentage.' },
  { label: 'Create Your Own', body: 'Don\'t see a band that fits? Create your own band and recruit AI artists to join you.' },
];

// Generate some random bands looking for members
const generateScoutingBands = () => {
  const genres = ['Pop', 'Rock', 'Hip-Hop', 'R&B', 'Electronic', 'Indie', 'Jazz', 'Country'];
  const bandNames = [
    'The Midnight Echo', 'Neon Dreams', 'Crystal Wave', 'Thunder Road', 'Velvet Sky',
    'Golden Hour', 'Silver Lining', 'Electric Soul', 'Wild Hearts', 'Starlight',
    'Rising Tide', 'Northern Lights', 'Desert Rose', 'Ocean Drive', 'City Lights',
  ];
  
  return bandNames.map((name, i) => ({
    id: `scout-band-${i}`,
    name,
    genre: genres[i % genres.length],
    memberCount: Math.floor(Math.random() * 2) + 1, // 1-2 members already
    maxMembers: 3,
    lookingFor: ['Vocals', 'Guitar', 'Bass', 'Drums', 'Keyboard'][i % 5],
    fame: Math.floor(Math.random() * 40) + 10, // 10-50 fame
    tier: ['D', 'C', 'B'][Math.floor(Math.random() * 3)],
  }));
};

export default function BandScoutingScreen({ onBack, onCreateBand }) {
  const { bands, createBand, week, fame } = useGame();
  const currentTheme = useTheme();
  
  const [scoutingBands] = useState(generateScoutingBands());
  
  const handleJoinBand = (band) => {
    // TODO: Implement joining logic
    // For now, redirect to create band since we need to integrate with the existing band system
    onCreateBand();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 16 }}>
        <BackButton onPress={onBack} label="" />
        <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 8 }}>Band Scouting</Text>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}>
          Find bands looking for members
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 120, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Create Your Own Band */}
        <TouchableOpacity
          onPress={onCreateBand}
          style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            ...shadows.sm,
          }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: borderRadius.lg, backgroundColor: colors.energy, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>+</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.energy, fontSize: fontSize.base, fontWeight: fontWeight.bold }}>Create Your Own Band</Text>
              <Text style={{ color: colors.textTertiary, fontSize: fontSize.sm, marginTop: 2 }}>Form a band with AI artists</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Scouting Bands */}
        {scoutingBands.map((band) => (
          <View
            key={band.id}
            style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.glassBorder,
              ...shadows.sm,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 56, height: 56, borderRadius: borderRadius.lg, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 28 }}>🎤</Text>
                </View>
                <View>
                  <Text style={{ color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>{band.name}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: fontSize.sm, marginTop: 2 }}>
                    {band.genre} • Tier {band.tier}
                  </Text>
                </View>
              </View>
              <View style={{ backgroundColor: `${colors.cash}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.md }}>
                <Text style={{ color: colors.cash, fontSize: fontSize.xs, fontWeight: '700' }}>Fame {band.fame}</Text>
              </View>
            </View>

            <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: colors.border, borderRadius: borderRadius.md, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 24 }}>👥</Text>
                <Text style={{ color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '700', marginTop: 4 }}>{band.memberCount}/{band.maxMembers}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: fontSize.xs, marginTop: 2 }}>MEMBERS</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.border, borderRadius: borderRadius.md, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 24 }}>🔍</Text>
                <Text style={{ color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600', marginTop: 4 }}>{band.lookingFor}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: fontSize.xs, marginTop: 2 }}>LOOKING FOR</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => handleJoinBand(band)}
              style={{
                marginTop: 16,
                backgroundColor: colors.energy,
                borderRadius: borderRadius.md,
                paddingVertical: 12,
                alignItems: 'center',
                ...shadows.gold,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#000', fontSize: fontSize.sm, fontWeight: fontWeight.bold, letterSpacing: 1 }}>JOIN BAND</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
