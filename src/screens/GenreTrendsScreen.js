import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useGame } from '../state/GameState';
import { genreTree } from '../data/constants';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_W = Dimensions.get('window').width;

export default function GenreTrendsScreen({ onBack }) {
  const { genreTrendsHistory, currentTrends, upcomingTrends, week } = useGame();

  // Get all main genres
  const mainGenres = genreTree.map((g) => g.genre);

  // Prepare chart data - only show trending genres for cleaner look
  const trendingGenres = currentTrends.length > 0
    ? currentTrends.map(t => t.genre)
    : mainGenres.slice(0, 4); // Show top 4 if no trends

  const chartData = {
    labels: genreTrendsHistory.map((h) => `W${h.week}`),
    datasets: trendingGenres.map((genre, index) => {
      // Use a cohesive gradient palette (cyan to purple)
      const hue = 180 + (index * 40); // 180 (cyan) to 340 (pink/purple)
      const color = `hsl(${hue}, 70%, 60%)`;

      return {
        data: genreTrendsHistory.map((h) => h.trends[genre] || 1),
        color: (opacity = 1) => color.replace(')', `, ${opacity})`).replace('hsl', 'hsla'),
        strokeWidth: 3,
      };
    }),
  };

  // Calculate current week's multiplier for each genre
  const currentMultipliers = {};
  mainGenres.forEach((genre) => {
    const trend = currentTrends.find((t) => t.genre === genre);
    if (trend) {
      currentMultipliers[genre] = trend.multiplier;
    } else if (currentTrends.length > 0 && genreTrendsHistory.length > 0) {
      // Get the latest trend value from history
      const latestHistory = genreTrendsHistory[genreTrendsHistory.length - 1];
      currentMultipliers[genre] = latestHistory?.trends[genre] || 1;
    } else {
      currentMultipliers[genre] = 1;
    }
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Genre Trends</Text>
          <Text style={styles.subtitle}>Track genre popularity over time</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>24-Week Trend History</Text>
          {genreTrendsHistory.length > 0 ? (
            <LineChart
              data={chartData}
              width={SCREEN_W - 32}
              height={300}
              chartConfig={{
                backgroundColor: '#0f0f1a',
                backgroundGradientFrom: '#0f0f1a',
                backgroundGradientTo: '#0f0f1a',
                decimalPlaces: 2,
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(255, 255, 255, 0.6)`,
                style: { borderRadius: 16 },
                propsForDots: { r: 0 },
                propsForLabels: { fontSize: 10 },
              }}
              bezier
              style={styles.chart}
              withDots={false}
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={true}
              horizontalLinesColor="rgba(255,255,255,0.08)"
            />
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyText}>No trend history yet</Text>
              <Text style={styles.emptySubtext}>Trends will appear after 6 weeks</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Trends</Text>
          {currentTrends.length === 0 ? (
            <Text style={styles.noTrends}>No active trends yet</Text>
          ) : (
            currentTrends.map((trend) => (
              <View key={trend.genre} style={styles.trendCard}>
                <View style={styles.trendHeader}>
                  <Text style={styles.trendGenre}>{trend.genre}</Text>
                  <View style={styles.trendBadge}>
                    <Text style={styles.trendMultiplier}>+{Math.round((trend.multiplier - 1) * 100)}%</Text>
                  </View>
                </View>
                <Text style={styles.trendWeeks}>{trend.weeksLeft} weeks remaining</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Trends</Text>
          {upcomingTrends.length === 0 ? (
            <Text style={styles.noTrends}>No upcoming trends</Text>
          ) : (
            upcomingTrends.map((trend) => (
              <View key={trend.genre} style={styles.trendCard}>
                <View style={styles.trendHeader}>
                  <Text style={styles.trendGenre}>{trend.genre}</Text>
                  <View style={[styles.trendBadge, styles.upcomingBadge]}>
                    <Text style={styles.trendMultiplier}>+{Math.round((trend.multiplier - 1) * 100)}%</Text>
                  </View>
                </View>
                <Text style={styles.trendWeeks}>Starting in {trend.startsInWeeks} week{trend.startsInWeeks !== 1 ? 's' : ''}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Genres (Current Multiplier)</Text>
          {mainGenres.map((genre) => {
            const multiplier = currentMultipliers[genre];
            const isTrending = currentTrends.some((t) => t.genre === genre);
            const isUpcoming = upcomingTrends.some((t) => t.genre === genre);
            
            return (
              <View key={genre} style={styles.genreRow}>
                <Text style={styles.genreName}>{genre}</Text>
                <View style={[
                  styles.multiplierBadge,
                  isTrending && styles.multiplierTrending,
                  isUpcoming && styles.multiplierUpcoming,
                  !isTrending && !isUpcoming && currentTrends.length > 0 && styles.multiplierNonTrending
                ]}>
                  <Text style={styles.multiplierText}>
                    {multiplier > 1 ? `+${Math.round((multiplier - 1) * 100)}%` : multiplier < 1 ? `${Math.round((multiplier - 1) * 100)}%` : '0%'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  chart: {
    borderRadius: 16,
  },
  emptyChart: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  noTrends: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },
  trendCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  trendGenre: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  trendBadge: {
    backgroundColor: 'rgba(0, 200, 150, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  upcomingBadge: {
    backgroundColor: 'rgba(255, 184, 0, 0.2)',
  },
  trendMultiplier: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  trendWeeks: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  genreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
  },
  genreName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  multiplierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  multiplierTrending: {
    backgroundColor: 'rgba(0, 200, 150, 0.2)',
  },
  multiplierUpcoming: {
    backgroundColor: 'rgba(255, 184, 0, 0.2)',
  },
  multiplierNonTrending: {
    backgroundColor: 'rgba(255, 59, 59, 0.2)',
  },
  multiplierText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
