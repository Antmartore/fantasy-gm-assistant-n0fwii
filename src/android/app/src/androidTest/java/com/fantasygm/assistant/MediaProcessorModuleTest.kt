package com.fantasygm.assistant

import android.Manifest
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.ReactApplicationContext
import com.fantasygm.assistant.modules.media.MediaProcessorModule
import org.junit.*
import org.junit.runner.RunWith
import java.io.File
import kotlin.system.measureTimeMillis

private const val TAG = "MediaProcessorModuleTest"
private const val TEST_TIMEOUT = 5000L // 5 seconds
private const val VIDEO_QUALITY_THRESHOLD = 1080
private const val AUDIO_BITRATE_MIN = 128000 // 128kbps
private const val PERFORMANCE_THRESHOLD_MS = 2000 // 2 seconds

@RunWith(AndroidJUnit4::class)
class MediaProcessorModuleTest {

    private lateinit var context: ReactApplicationContext
    private lateinit var mediaProcessor: MediaProcessorModule
    
    @get:Rule
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.WRITE_EXTERNAL_STORAGE,
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.RECORD_AUDIO
    )

    @Before
    fun setup() {
        // Initialize test context and module
        val instrumentationContext = InstrumentationRegistry.getInstrumentation().targetContext
        context = ReactApplicationContext(instrumentationContext)
        mediaProcessor = MediaProcessorModule(context)
        
        // Clear any existing cache
        clearMediaCache()
    }

    @Test
    fun testGenerateTradeVideo() {
        // Prepare test data
        val tradeOptions = JavaOnlyMap().apply {
            putString("tradeId", "test_trade_123")
            putMap("content", Arguments.createMap().apply {
                putString("player1", "Tom Brady")
                putString("player2", "Patrick Mahomes")
                putMap("stats", Arguments.createMap().apply {
                    putInt("passingYards", 4500)
                    putInt("touchdowns", 35)
                })
            })
            putInt("width", VIDEO_QUALITY_THRESHOLD)
            putInt("height", VIDEO_QUALITY_THRESHOLD)
            putInt("fps", 30)
        }

        // Measure performance
        val executionTime = measureTimeMillis {
            var videoPath: String? = null
            
            // Generate video
            mediaProcessor.generateTradeVideo(tradeOptions) { path ->
                videoPath = path.toString()
            }.get(TEST_TIMEOUT)

            // Verify video was generated
            Assert.assertNotNull("Video path should not be null", videoPath)
            
            // Validate video quality
            val retriever = MediaMetadataRetriever().apply {
                setDataSource(videoPath)
            }
            
            // Check video resolution
            val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt()
            val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt()
            Assert.assertTrue("Video resolution should meet quality threshold",
                width!! >= VIDEO_QUALITY_THRESHOLD && height!! >= VIDEO_QUALITY_THRESHOLD)
            
            // Check frame rate
            val frameRate = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toInt()
            Assert.assertEquals("Frame rate should be 30fps", 30, frameRate)
            
            // Verify file exists and has content
            val videoFile = File(videoPath!!)
            Assert.assertTrue("Video file should exist", videoFile.exists())
            Assert.assertTrue("Video file should have content", videoFile.length() > 0)
            
            retriever.release()
        }

        // Verify performance meets requirements
        Assert.assertTrue("Video generation should complete within performance threshold",
            executionTime <= PERFORMANCE_THRESHOLD_MS)
    }

    @Test
    fun testGenerateVoiceNarration() {
        // Prepare test data
        val narrationOptions = JavaOnlyMap().apply {
            putString("tradeId", "test_trade_123")
            putString("script", "Analysis of trade between Tom Brady and Patrick Mahomes")
            putMap("voiceConfig", Arguments.createMap().apply {
                putString("voice", "en-US-Standard-A")
                putFloat("pitch", 1.0f)
                putFloat("speakingRate", 1.0f)
            })
        }

        // Measure performance
        val executionTime = measureTimeMillis {
            var audioPath: String? = null
            
            // Generate narration
            mediaProcessor.generateVoiceNarration(narrationOptions) { path ->
                audioPath = path.toString()
            }.get(TEST_TIMEOUT)

            // Verify audio was generated
            Assert.assertNotNull("Audio path should not be null", audioPath)
            
            // Validate audio quality
            val extractor = MediaExtractor()
            extractor.setDataSource(audioPath)
            
            // Get audio format
            val format = extractor.getTrackFormat(0)
            val mimeType = format.getString(MediaFormat.KEY_MIME)
            val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            val bitrate = format.getInteger(MediaFormat.KEY_BIT_RATE)
            
            // Verify audio specifications
            Assert.assertTrue("Audio format should be AAC", 
                mimeType?.contains("audio/mp4a-latm") == true)
            Assert.assertTrue("Sample rate should be at least 44.1kHz",
                sampleRate >= 44100)
            Assert.assertTrue("Bitrate should meet minimum threshold",
                bitrate >= AUDIO_BITRATE_MIN)
            
            // Verify file exists and has content
            val audioFile = File(audioPath!!)
            Assert.assertTrue("Audio file should exist", audioFile.exists())
            Assert.assertTrue("Audio file should have content", audioFile.length() > 0)
            
            extractor.release()
        }

        // Verify performance meets requirements
        Assert.assertTrue("Voice narration should complete within performance threshold",
            executionTime <= PERFORMANCE_THRESHOLD_MS)
    }

    @Test
    fun testMediaProcessingPerformance() {
        val iterations = 5
        val performanceResults = mutableListOf<Long>()
        
        // Run multiple iterations to test consistency
        repeat(iterations) {
            val tradeOptions = JavaOnlyMap().apply {
                putString("tradeId", "test_trade_${it}")
                putMap("content", Arguments.createMap().apply {
                    putString("player1", "Player${it}_1")
                    putString("player2", "Player${it}_2")
                })
            }
            
            val executionTime = measureTimeMillis {
                mediaProcessor.generateTradeVideo(tradeOptions) {}.get(TEST_TIMEOUT)
            }
            
            performanceResults.add(executionTime)
        }
        
        // Calculate performance metrics
        val averageTime = performanceResults.average()
        val maxTime = performanceResults.maxOrNull()
        
        // Verify performance requirements
        Assert.assertTrue("Average processing time should be within threshold",
            averageTime <= PERFORMANCE_THRESHOLD_MS)
        Assert.assertTrue("Maximum processing time should be within acceptable range",
            maxTime!! <= PERFORMANCE_THRESHOLD_MS * 1.5)
    }

    private fun clearMediaCache() {
        val cacheDir = File(context.cacheDir, "media")
        if (cacheDir.exists()) {
            cacheDir.listFiles()?.forEach { it.delete() }
        }
    }
}